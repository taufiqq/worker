// --- START OF FILE streamer.client.js ---

(function() {
    'use strict';

    // --- Konfigurasi Supabase (diambil dari prompt Anda) ---
    const SUPABASE_URL = 'https://umqbiksfxyiarsftwkac.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtcWJpa3NmeHlpYXJzZnR3a2FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxNTM1NTUsImV4cCI6MjA2ODcyOTU1NX0.bNylE96swkVo5rNvqY5JDiM-nSFcs6nEGZEiFpNpos0';

    // --- Inisialisasi Klien Supabase ---
    const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // --- Variabel Global & DOM Elements ---
    const startButton = document.getElementById('startButton');
    const localVideo = document.getElementById('localVideo');
    const statusDisplay = document.getElementById('status');
    const sessionIdDisplay = document.getElementById('sessionIdDisplay');
    
    let peerConnection;
    let localStream;
    let supabaseChannel;
    
    // ID unik untuk pengirim ini, agar tidak memproses sinyalnya sendiri
    const senderId = 'streamer-' + Math.random().toString(36).substring(2, 9);
    
    // Ambil Session ID (id_mobil) dari URL, ini adalah cara paling andal di halaman streamer
    const sessionId = window.location.pathname.split('/').pop();
    
    if (!sessionId) {
        updateStatus("Error: Session ID (id_mobil) tidak ditemukan di URL.", true);
        return;
    }
    
    sessionIdDisplay.textContent = sessionId;
    startButton.disabled = false;

    // --- Konfigurasi WebRTC ---
    const peerConnectionConfig = {
        'iceServers': [
            { 'urls': 'stun:stun.l.google.com:19302' } // Server STUN publik dari Google
        ]
    };

    const videoConstraints = {
        video: {
            // Sesuai permintaan: 320x640. Namun, untuk FPV landscape, 640x320 lebih umum.
            // Anda bisa menukar nilai ini jika orientasinya berbeda.
            width: { ideal: 640 },
            height: { ideal: 320 },
            frameRate: { ideal: 24 }
        },
        audio: false // Audio dinonaktifkan sesuai permintaan
    };

    /**
     * Memperbarui teks status di UI
     * @param {string} text - Pesan yang akan ditampilkan
     * @param {boolean} isError - Jika true, akan diberi warna merah
     */
    function updateStatus(text, isError = false) {
        console.log(text);
        statusDisplay.textContent = `Status: ${text}`;
        statusDisplay.style.color = isError ? '#dc3545' : '#212529';
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
     * Fungsi utama untuk memulai streaming
     */
    async function startStreaming() {
        startButton.disabled = true;
        updateStatus('Memulai kamera...');

        try {
            // 1. Dapatkan akses ke kamera perangkat
            localStream = await navigator.mediaDevices.getUserMedia(videoConstraints);
            localVideo.srcObject = localStream; // Tampilkan preview (meskipun elemen video disembunyikan)
            updateStatus('Kamera aktif. Menyiapkan koneksi peer...');

            // 2. Buat koneksi RTCPeerConnection baru
            peerConnection = new RTCPeerConnection(peerConnectionConfig);

            // 3. Tambahkan track video ke koneksi
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
            
            // 4. Handler untuk ICE Candidate
            // Ini akan dipicu ketika browser menemukan jalur jaringan (kandidat)
            peerConnection.onicecandidate = event => {
                if (event.candidate) {
                    sendSignal('candidate', event.candidate);
                }
            };
            
            // 5. Handler saat koneksi berubah status
            peerConnection.onconnectionstatechange = () => {
                updateStatus(`Status Koneksi: ${peerConnection.connectionState}`);
                if (peerConnection.connectionState === 'connected') {
                    // Sembunyikan video lokal setelah terhubung untuk menghemat daya
                    localVideo.style.display = 'none';
                }
            };

            // 6. Inisialisasi channel Supabase untuk signaling
            setupSupabaseChannel();

            // 7. Buat 'offer' untuk memulai sesi WebRTC
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            
            // 8. Kirim 'offer' ke receiver melalui Supabase
            sendSignal('offer', offer);
            updateStatus('Offer terkirim, menunggu jawaban dari kontroler...');

        } catch (error) {
            updateStatus(`Error: ${error.message}`, true);
            startButton.disabled = false;
        }
    }
    
    /**
     * Menyiapkan channel Supabase untuk menerima sinyal balasan
     */
    function setupSupabaseChannel() {
        supabaseChannel = supabase.channel(`webrtc:${sessionId}`, {
            config: {
                broadcast: {
                    self: false // Jangan terima pesan dari diri sendiri
                }
            }
        });

        supabaseChannel.on('broadcast', { event: 'signal' }, ({ payload }) => {
            // Pastikan kita tidak memproses sinyal dari diri sendiri (jika 'self:false' gagal)
            if (payload.sender_id === senderId) return;

            console.log('Sinyal diterima:', payload);

            if (payload.type === 'answer') {
                // Receiver telah mengirim jawaban, set sebagai remote description
                peerConnection.setRemoteDescription(new RTCSessionDescription(payload.data))
                    .catch(e => updateStatus(`Gagal set remote description: ${e.message}`, true));
            } else if (payload.type === 'candidate') {
                // Receiver mengirim kandidat ICE, tambahkan ke koneksi
                peerConnection.addIceCandidate(new RTCIceCandidate(payload.data))
                    .catch(e => updateStatus(`Gagal menambah ICE candidate: ${e.message}`, true));
            }
        }).subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                updateStatus('Channel signaling siap. Menunggu jawaban...');
            } else {
                updateStatus(`Status channel: ${status}`, status !== 'SUBSCRIBED');
            }
        });
    }

    // --- Event Listener ---
    startButton.addEventListener('click', startStreaming);

})();
// --- END OF FILE streamer.client.js ---