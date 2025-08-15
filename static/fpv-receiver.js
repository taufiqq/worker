// --- START OF FILE fpv-receiver.js ---

(function() {
    'use strict';

    if (typeof window.MQTT_CREDENTIALS === 'undefined') {
        console.error('FPV Receiver Error: Data kredensial (MQTT_CREDENTIALS) tidak ditemukan.');
        return;
    }

    // --- Konfigurasi Supabase ---
    const SUPABASE_URL = 'https://umqbiksfxyiarsftwkac.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtcWJpa3NmeHlpYXJzZnR3a2FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxNTM1NTUsImV4cCI6MjA2ODcyOTU1NX0.bNylE96swkVo5rNvqY5JDiM-nSFcs6nEGZEiFpNpos0';

    // --- Inisialisasi Klien Supabase (PERBAIKAN DI SINI) ---
    const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // --- Variabel Global & DOM Elements ---
    const remoteVideo = document.getElementById('remoteVideo');
    const statusDisplay = document.getElementById('status');
    const startButton = document.getElementById('start-fullscreen-btn');

    let peerConnection;
    let supabaseChannel;

    const senderId = 'receiver-' + Math.random().toString(36).substring(2, 9);
    const sessionId = window.MQTT_CREDENTIALS.id_mobil;
    const peerConnectionConfig = { /* ... */ };
    
    function updateStatus(text, isError = false) { /* ... */ }

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

    function initializeFPV() {
        if (!sessionId) {
            updateStatus('Error: Session ID (id_mobil) tidak valid.', true);
            return;
        }
        updateStatus('Menyiapkan koneksi FPV...');
        peerConnection = new RTCPeerConnection(peerConnectionConfig);
        
        peerConnection.ontrack = event => {
            updateStatus('Stream video diterima!');
            if (remoteVideo.srcObject !== event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
                remoteVideo.play().catch(e => console.error("Gagal memutar video:", e));
            }
        };

        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                sendSignal('candidate', event.candidate);
            }
        };
        
        peerConnection.onconnectionstatechange = () => {
            updateStatus(`Status Koneksi: ${peerConnection.connectionState}`);
            if (peerConnection.connectionState === 'failed') {
                peerConnection.restartIce();
                updateStatus('Koneksi gagal, mencoba menghubungkan ulang...');
            }
        };
        
        setupSupabaseChannel();
    }
    
    function setupSupabaseChannel() {
        // PERBAIKAN: Gunakan 'supabaseClient'
        supabaseChannel = supabaseClient.channel(`webrtc:${sessionId}`, {
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
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.data));
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);
                    sendSignal('answer', answer);
                    updateStatus('Jawaban terkirim, menunggu stream...');
                } else if (payload.type === 'candidate') {
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

    if(startButton){
        startButton.addEventListener('click', initializeFPV, { once: true });
    } else {
        document.addEventListener('DOMContentLoaded', initializeFPV);
    }
})();
// --- END OF FILE fpv-receiver.js ---