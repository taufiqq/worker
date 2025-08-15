// --- START OF FILE streamer.client.js ---

(function() {
    'use strict';

    // --- Konfigurasi Supabase ---
    const SUPABASE_URL = 'https://umqbiksfxyiarsftwkac.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtcWJpa3NmeHlpYXJzZnR3a2FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxNTM1NTUsImV4cCI6MjA2ODcyOTU1NX0.bNylE96swkVo5rNvqY5JDiM-nSFcs6nEGZEiFpNpos0';

    // --- Inisialisasi Klien Supabase (PERBAIKAN DI SINI) ---
    // Objek 'supabase' global datang dari script CDN. Kita buat instance client kita
    // dengan nama yang berbeda untuk menghindari konflik.
    const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // --- Variabel Global & DOM Elements ---
    const startButton = document.getElementById('startButton');
    const localVideo = document.getElementById('localVideo');
    const statusDisplay = document.getElementById('status');
    const sessionIdDisplay = document.getElementById('sessionIdDisplay');
    
    let peerConnection;
    let localStream;
    let supabaseChannel;
    
    const senderId = 'streamer-' + Math.random().toString(36).substring(2, 9);
    const sessionId = window.location.pathname.split('/').pop();
    
    if (!sessionId) {
        updateStatus("Error: Session ID (id_mobil) tidak ditemukan di URL.", true);
        return;
    }
    
    sessionIdDisplay.textContent = sessionId;
    startButton.disabled = false;

    // --- (Sisa kode di bawah ini tetap sama, hanya perlu mengganti 'supabase' menjadi 'supabaseClient') ---
    
    const peerConnectionConfig = { /* ... */ };
    const videoConstraints = { /* ... */ };

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

    async function startStreaming() {
        startButton.disabled = true;
        updateStatus('Memulai kamera...');

        try {
            localStream = await navigator.mediaDevices.getUserMedia(videoConstraints);
            localVideo.srcObject = localStream;
            updateStatus('Kamera aktif. Menyiapkan koneksi peer...');

            peerConnection = new RTCPeerConnection(peerConnectionConfig);

            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
            
            peerConnection.onicecandidate = event => {
                if (event.candidate) {
                    sendSignal('candidate', event.candidate);
                }
            };
            
            peerConnection.onconnectionstatechange = () => {
                updateStatus(`Status Koneksi: ${peerConnection.connectionState}`);
            };

            // Panggil fungsi setup channel
            setupSupabaseChannel();

            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            
            sendSignal('offer', offer);
            updateStatus('Offer terkirim, menunggu jawaban dari kontroler...');

        } catch (error) {
            updateStatus(`Error: ${error.message}`, true);
            startButton.disabled = false;
        }
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

        supabaseChannel.on('broadcast', { event: 'signal' }, ({ payload }) => {
            if (payload.sender_id === senderId) return;
            console.log('Sinyal diterima:', payload);
            if (payload.type === 'answer') {
                peerConnection.setRemoteDescription(new RTCSessionDescription(payload.data))
                    .catch(e => updateStatus(`Gagal set remote description: ${e.message}`, true));
            } else if (payload.type === 'candidate') {
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

    startButton.addEventListener('click', startStreaming);

})();
// --- END OF FILE streamer.client.js ---