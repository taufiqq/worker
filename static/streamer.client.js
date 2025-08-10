// public/streamer.client.js

document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('startButton');
    const localVideo = document.getElementById('localVideo');
    const sessionIdDisplay = document.getElementById('sessionIdDisplay');
    const statusDiv = document.getElementById('status');

    const updateStatus = (message) => {
        console.log(message);
        statusDiv.textContent = `Status: ${message}`;
    };

    // --- BACA SESSION ID DARI SERVER ---
    // Variabel ini disuntikkan oleh server ke dalam HTML.
    if (!window.WEBRTC_SESSION_ID) {
        updateStatus('ERROR: Session ID tidak ditemukan. Halaman tidak dimuat dengan benar.');
        sessionIdDisplay.textContent = 'Error! Gagal memuat ID.';
        document.body.style.backgroundColor = '#ffcdd2';
        return; // Hentikan eksekusi jika ID tidak ada
    }
    const sessionId = window.WEBRTC_SESSION_ID;
    sessionIdDisplay.textContent = sessionId;
    startButton.disabled = false; // Aktifkan tombol karena ID sudah ada

    // --- PENGATURAN SUPABASE (Tetap sama) ---
    const SUPABASE_URL = 'https://umqbiksfxyiarsftwkac.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtcWJpa3NmeHlpYXJzZnR3a2FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxNTM1NTUsImV4cCI6MjA2ODcyOTU1NX0.bNylE96swkVo5rNvqY5JDiM-nSFcs6nEGZEiFpNpos0';
    const supabaseC = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    // -----------------------------------------------------------

    const clientId = 'pengirim-' + Math.random().toString(36).substr(2, 9);
    const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    let peerConnection;
    let localStream;
    let remoteCandidateQueue = [];

    // Fungsi sendSignal dan subscribeToSignals tidak perlu diubah.
    // Copy-paste dari file pengirim.js Anda.
    async function sendSignal(type, data) { /* ... (tidak ada perubahan) ... */ }
    function subscribeToSignals() { /* ... (tidak ada perubahan) ... */ }
    
    // --- (Paste fungsi sendSignal dan subscribeToSignals di sini) ---
    async function sendSignal(type, data) {
        await supabaseC.from('webrtc_signals').insert([
            { session_id: sessionId, sender_id: clientId, type: type, data: data }
        ]);
    }

    function subscribeToSignals() {
        supabaseC.channel(`webrtc-signals-${sessionId}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'webrtc_signals', filter: `session_id=eq.${sessionId}`},
                async (payload) => {
                    const signal = payload.new;
                    if (signal.sender_id === clientId) return;

                    updateStatus(`Menerima sinyal tipe: ${signal.type}`);
                    const signalData = signal.data;

                    if (signal.type === 'answer') {
                        if (peerConnection.signalingState !== 'stable') {
                            await peerConnection.setRemoteDescription(new RTCSessionDescription(signalData));
                            updateStatus('Answer diterima.');
                            while(remoteCandidateQueue.length > 0) {
                                await peerConnection.addIceCandidate(remoteCandidateQueue.shift());
                            }
                        }
                    } else if (signal.type === 'candidate') {
                        if (peerConnection.remoteDescription) {
                            await peerConnection.addIceCandidate(new RTCIceCandidate(signalData));
                        } else {
                            remoteCandidateQueue.push(new RTCIceCandidate(signalData));
                        }
                    }
                }
            )
            .subscribe((status, err) => {
                if (status === 'SUBSCRIBED') {
                    updateStatus('Berhasil subscribe ke channel. Menunggu penerima...');
                } else {
                    updateStatus(`Gagal subscribe: ${err?.message || 'error'}`);
                }
            });
    }


    startButton.onclick = async () => {
        // Logika untuk memulai stream tidak perlu diubah.
        // Copy-paste dari file pengirim.js Anda.
        startButton.disabled = true;
        updateStatus('Memulai...');

        try {
            const backCameraConstraints = { video: { width: { exact: 640 }, height: { exact: 360 }, frameRate: { ideal: 24, max: 24 }, facingMode: { ideal: "environment" } }, audio: false };
            const frontCameraConstraints = { video: { width: { exact: 640 }, height: { exact: 360 }, frameRate: { ideal: 24, max: 24 }, facingMode: "user" }, audio: false };
            
            try {
                updateStatus('Mencoba kamera belakang...');
                localStream = await navigator.mediaDevices.getUserMedia(backCameraConstraints);
            } catch (err) {
                updateStatus('Beralih ke kamera depan...');
                localStream = await navigator.mediaDevices.getUserMedia(frontCameraConstraints);
            }
            
            localVideo.srcObject = localStream;
            updateStatus('Kamera berhasil diakses.');
            peerConnection = new RTCPeerConnection(configuration);
            localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
            peerConnection.onicecandidate = event => {
                if (event.candidate) sendSignal('candidate', event.candidate);
            };
            peerConnection.onconnectionstatechange = () => updateStatus(`Connection state: ${peerConnection.connectionState}`);
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            updateStatus('Offer dibuat, mengirim ke server...');
            await sendSignal('offer', offer);
            subscribeToSignals();

        } catch (error) {
            updateStatus(`Error: ${error.message}`);
            startButton.disabled = false;
        }
    };
});