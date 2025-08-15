document.addEventListener('DOMContentLoaded', () => {
    const remoteVideo = document.getElementById('remoteVideo');
    const statusDiv = document.getElementById('status');
    let peerConnection;

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

    // Ambil sessionId (id_mobil) dari data global
    if (!window.MQTT_CREDENTIALS || !window.MQTT_CREDENTIALS.id_mobil) {
        updateStatus("Error: Data sesi tidak lengkap.");
        return;
    }
    const sessionId = window.MQTT_CREDENTIALS.id_mobil;
    const myId = 'viewer'; // ID unik untuk pengirim ini

    // PENTING: Tambahkan server TURN untuk keandalan maksimal
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

    // Fungsi untuk mengirim sinyal melalui Supabase
    async function sendSignal(type, data) {
        const { error } = await supabase.from('webrtc_signals').insert({
            session_id: sessionId,
            sender_id: myId,
            type: type,
            data: data
        });
        if (error) {
            console.error('Error sending signal:', error);
            updateStatus(`Error mengirim sinyal: ${error.message}`);
        }
    }
    
    function startListening() {
        updateStatus(`Terhubung. Mendengarkan sinyal untuk sesi: ${sessionId}`);
        const channel = supabase.channel(`webrtc-${sessionId}`);

        channel.on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'webrtc_signals', filter: `session_id=eq.${sessionId}` },
            async (payload) => {
                const signal = payload.new;

                // Abaikan pesan yang kita kirim sendiri
                if (signal.sender_id === myId) return;

                updateStatus(`Menerima sinyal: ${signal.type}`);

                if (signal.type === 'offer') {
                    // Jika ada koneksi lama, tutup dulu
                    if (peerConnection) {
                        peerConnection.close();
                    }
                    peerConnection = new RTCPeerConnection(configuration);

                    peerConnection.ontrack = event => {
                        updateStatus('Stream video diterima! Mencoba menampilkan...');
                        if (remoteVideo.srcObject !== event.streams[0]) {
                            remoteVideo.srcObject = event.streams[0];
                            remoteVideo.play().catch(e => console.error("Autoplay gagal:", e));
                        }
                    };
                    peerConnection.onicecandidate = e => {
                        if (e.candidate) {
                            sendSignal('candidate', e.candidate);
                        }
                    };
                    peerConnection.onconnectionstatechange = () => {
                        updateStatus(`Status koneksi peer: ${peerConnection.connectionState}`);
                    };

                    await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.data));
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);
                    await sendSignal('answer', answer);

                } else if (signal.type === 'candidate' && peerConnection) {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(signal.data));
                }
            }
        ).subscribe();
    }
    
    // Mulai koneksi
    startListening();
});