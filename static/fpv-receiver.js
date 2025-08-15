// --- START OF FILE fpv-receiver.js ---

(function() {
    'use strict';

    // Pastikan skrip ini berjalan setelah data kredensial disuntikkan
    if (typeof window.MQTT_CREDENTIALS === 'undefined') {
        console.error('FPV Receiver Error: Data kredensial (MQTT_CREDENTIALS) tidak ditemukan.');
        const statusDiv = document.getElementById('status');
        if(statusDiv) statusDiv.textContent = 'Status: Gagal memuat data sesi.';
        return;
    }

    // --- Konfigurasi Supabase (diambil dari prompt Anda) ---
    const SUPABASE_URL = 'https://umqbiksfxyiarsftwkac.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtcWJpa3NmeHlpYXJzZnR3a2FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxNTM1NTUsImV4cCI6MjA2ODcyOTU1NX0.bNylE96swkVo5rNvqY5JDiM-nSFcs6nEGZEiFpNpos0';

    // --- Inisialisasi Klien Supabase ---
    const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // --- Variabel Global & DOM Elements ---
    const remoteVideo = document.getElementById('remoteVideo');
    const statusDisplay = document.getElementById('status');
    const startButton = document.getElementById('start-fullscreen-btn');

    let peerConnection;
    let supabaseChannel;

    // ID unik untuk penerima ini, agar tidak memproses sinyalnya sendiri
    const senderId = 'receiver-' + Math.random().toString(36).substring(2, 9);
    
    // Ambil Session ID dari data yang disuntikkan oleh server
    const sessionId = window.MQTT_CREDENTIALS.id_mobil;

    // --- Konfigurasi WebRTC ---
    const peerConnectionConfig = {
        'iceServers': [
            { 'urls': 'stun:stun.l.google.com:19302' } // Server STUN publik dari Google
        ]
    };
    
    /**
     * Memperbarui teks status di UI
     * @param {string} text - Pesan yang akan ditampilkan
     * @param {boolean} isError - Jika true, akan diberi warna merah
     */
    function updateStatus(text, isError = false) {
        console.log(text);
        statusDisplay.textContent = `Status: ${text}`;
        statusDisplay.style.color = isError ? '#ff4d4d' : 'white';
    }

    /**
     * Mengirim sinyal WebRTC melalui Supabase
     * @param {string} type - Tipe sinyal ('offer', 'answer', 'candidate')
     * @param {object} data - Data sinyal (objek SDP atau ICE Candidate)
     */
    async function sendSignal(type, data) {
        if (!supabaseChannel) return;
        try {
            await supabaseChannel.send({
                type: 'broadcast',
                event: 'signal',
                payload: { sender_id: senderId, type, data },
            });
        } catch (error) {
            updateStatus(`Gagal mengirim sinyal ${type}: ${error.message}`, true);
        }
    }

    /**
     * Fungsi utama untuk memulai koneksi FPV
     */
    function initializeFPV() {
        if (!sessionId) {
            updateStatus('Error: Session ID (id_mobil) tidak valid.', true);
            return;
        }

        updateStatus('Menyiapkan koneksi FPV...');

        // 1. Buat koneksi RTCPeerConnection baru
        peerConnection = new RTCPeerConnection(peerConnectionConfig);
        
        // 2. Handler utama: saat track video diterima dari streamer
        peerConnection.ontrack = event => {
            updateStatus('Stream video diterima!');
            if (remoteVideo.srcObject !== event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
                remoteVideo.play().catch(e => console.error("Gagal memutar video:", e));
            }
        };

        // 3. Handler untuk ICE Candidate
        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                sendSignal('candidate', event.candidate);
            }
        };
        
        // 4. Handler saat koneksi berubah status
        peerConnection.onconnectionstatechange = () => {
            updateStatus(`Status Koneksi: ${peerConnection.connectionState}`);
            if (peerConnection.connectionState === 'failed') {
                 // Coba restart ICE untuk memulihkan koneksi
                peerConnection.restartIce();
                updateStatus('Koneksi gagal, mencoba menghubungkan ulang...');
            }
        };

        // 5. Inisialisasi channel Supabase untuk signaling
        setupSupabaseChannel();
    }
    
    /**
     * Menyiapkan channel Supabase untuk menerima sinyal dari streamer
     */
    function setupSupabaseChannel() {
        supabaseChannel = supabase.channel(`webrtc:${sessionId}`, {
            config: {
                broadcast: {
                    self: false
                }
            }
        });

        supabaseChannel.on('broadcast', { event: 'signal' }, async ({ payload }) => {
            if (payload.sender_id === senderId) return;

            console.log('Sinyal diterima:', payload);

            try {
                if (payload.type === 'offer') {
                    // 1. Terima 'offer' dari streamer
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.data));
                    
                    // 2. Buat 'answer'
                    const answer = await peerConnection.createAnswer();
                    
                    // 3. Set 'answer' sebagai local description
                    await peerConnection.setLocalDescription(answer);
                    
                    // 4. Kirim 'answer' kembali ke streamer
                    sendSignal('answer', answer);
                    updateStatus('Jawaban terkirim, menunggu stream...');

                } else if (payload.type === 'candidate') {
                    // Terima kandidat ICE dari streamer
                    await peerConnection.addIceCandidate(new RTCIceCandidate(payload.data));
                }
            } catch (error) {
                updateStatus(`Gagal memproses sinyal: ${error.message}`, true);
            }
        }).subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                updateStatus('Terhubung ke channel signaling. Menunggu video dari mobil...');
            } else {
                updateStatus(`Status channel: ${status}`, status !== 'SUBSCRIBED');
            }
        });
    }

    // --- Inisialisasi ---
    // Kita panggil inisialisasi FPV saat pengguna menekan tombol "Mulai"
    // Ini adalah praktik terbaik untuk memastikan interaksi pengguna sebelum memulai video/audio.
    if(startButton){
        startButton.addEventListener('click', initializeFPV, { once: true });
    } else {
        // Jika tidak ada tombol start, mulai langsung (kurang direkomendasikan)
        document.addEventListener('DOMContentLoaded', initializeFPV);
    }
})();
// --- END OF FILE fpv-receiver.js ---