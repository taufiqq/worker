document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('startButton');
    const localVideo = document.getElementById('localVideo');
    const sessionIdDisplay = document.getElementById('sessionIdDisplay');
    const statusDiv = document.getElementById('status');

    let peerConnection;
    let localStream;

    // --- PENGATURAN SUPABASE ---
    // GANTI DENGAN KREDENSIAL ANDA
    const SUPABASE_URL = 'https://umqbiksfxyiarsftwkac.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtcWJpa3NmeHlpYXJzZnR3a2FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxNTM1NTUsImV4cCI6MjA2ODcyOTU1NX0.bNylE96swkVo5rNvqY5JDiM-nSFcs6nEGZEiFpNpos0';
    const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    // -------------------------

    const updateStatus = (message) => {
        console.log(message);
        statusDiv.textContent = `Status: ${message}`;
    };

    // 1. Baca Session ID (id_mobil) dari URL (TIDAK DIUBAH DARI KODE ASLI ANDA)
    const pathSegments = window.location.pathname.split('/');
    const sessionId = pathSegments[pathSegments.length - 1];
    const myId = 'streamer'; // ID untuk membedakan pengirim

    sessionIdDisplay.textContent = sessionId;
    startButton.disabled = false;

    // PENTING: Konfigurasi WebRTC dengan server TURN
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            {
                urls: 'turn:openrelay.metered.ca:80', // Server TURN gratis untuk tes
                username: 'openrelayproject',
                credential: 'openrelayproject'
            }
        ]
    };

    // 2. Fungsi untuk mengirim sinyal melalui Supabase (PENGGANTI WebSocket.send)
    async function sendSignal(type, data) {
        const { error } = await supabase.from('webrtc_signals').insert({
            session_id: sessionId,
            sender_id: myId,
            type: type,
            data: data
        });
        if (error) console.error('Error sending signal:', error);
    }
    
    // 3. Fungsi untuk mendengarkan sinyal dari Supabase (PENGGANTI WebSocket.onmessage)
    function setupSignalListener() {
        const channel = supabase.channel(`webrtc-${sessionId}`);
        
        channel.on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'webrtc_signals', filter: `session_id=eq.${sessionId}` },
            async (payload) => {
                const signal = payload.new;
                
                // Abaikan pesan yang kita kirim sendiri
                if (signal.sender_id === myId) return;

                updateStatus(`Menerima sinyal: ${signal.type}`);

                if (signal.type === 'answer') {
                    if (peerConnection.currentRemoteDescription) return;
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.data));
                } else if (signal.type === 'candidate') {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(signal.data));
                }
            }
        ).subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                updateStatus('Terhubung ke Supabase. Siap mengirim offer.');
            } else {
                updateStatus(`Status Supabase: ${status}`);
            }
        });
    }

    // 4. Logika saat tombol "Start" diklik (hampir tidak berubah)
    startButton.onclick = async () => {
        startButton.disabled = true;
        updateStatus('Memulai kamera...');

        try {
            const constraints = {
                video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: 24, facingMode: "environment" },
                audio: false
            };
            localStream = await navigator.mediaDevices.getUserMedia(constraints)
                .catch(() => navigator.mediaDevices.getUserMedia({ ...constraints, video: { ...constraints.video, facingMode: "user" }}));

            localVideo.srcObject = localStream;
            updateStatus('Kamera aktif. Menyiapkan koneksi peer...');

            peerConnection = new RTCPeerConnection(configuration);
            localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

            peerConnection.onicecandidate = event => {
                if (event.candidate) sendSignal('candidate', event.candidate);
            };
            peerConnection.onconnectionstatechange = () => updateStatus(`Status koneksi peer: ${peerConnection.connectionState}`);

            // Mulai mendengarkan, lalu kirim offer
            setupSignalListener(); 
            
            updateStatus('Membuat dan mengirim offer...');
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            await sendSignal('offer', offer);

        } catch (error) {
            updateStatus(`Error: ${error.message}`);
            startButton.disabled = false;
        }
    };
});