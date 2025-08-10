// fpv-receiver.js

document.addEventListener('DOMContentLoaded', () => {
    const remoteVideo = document.getElementById('remoteVideo');
    const statusDiv = document.getElementById('status');

    if (!remoteVideo || !statusDiv) {
        console.error("Elemen video FPV (#remoteVideo atau #status) tidak ditemukan. Pastikan HTML benar.");
        return;
    }

    // --- PENGATURAN SUPABASE ---
    const SUPABASE_URL = 'https://umqbiksfxyiarsftwkac.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtcWJpa3NmeHlpYXJzZnR3a2FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxNTM1NTUsImV4cCI6MjA2ODcyOTU1NX0.bNylE96swkVo5rNvqY5JDiM-nSFcs6nEGZEiFpNpos0';
    const supabaseC = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    // ---------------------------

    const clientId = 'penerima-' + Math.random().toString(36).substr(2, 9);
    const configuration = {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    };

    let peerConnection;
    let sessionId;

    const updateStatus = (message) => {
        console.log(message);
        statusDiv.textContent = `Status: ${message}`;
    };

    async function sendSignal(type, data) {
        if (!sessionId) return;
        await supabaseC.from('webrtc_signals').insert([
            { session_id: sessionId, sender_id: clientId, type: type, data: data }
        ]);
    }

    function subscribeToSignals() {
        if (!sessionId) return;

        const channel = supabaseC.channel(`webrtc-signals-${sessionId}`);
        
        channel.on(
            'postgres_changes',
            { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'webrtc_signals',
                filter: `session_id=eq.${sessionId}`
            },
            async (payload) => {
                const signal = payload.new;

                if (signal.sender_id === clientId) return; // Abaikan sinyal sendiri

                updateStatus(`Menerima sinyal tipe: ${signal.type}`);
                const signalData = signal.data;

                if (signal.type === 'offer') {
                    // Buat peer connection baru jika belum ada atau jika koneksi sebelumnya gagal
                    if (peerConnection) {
                        peerConnection.close();
                    }
                    peerConnection = new RTCPeerConnection(configuration);
                    
                    peerConnection.ontrack = event => {
                        updateStatus('Menerima stream video!');
                        if (remoteVideo.srcObject !== event.streams[0]) {
                            remoteVideo.srcObject = event.streams[0];
                        }
                    };

                    peerConnection.onicecandidate = event => {
                        if (event.candidate) {
                            updateStatus('Mengirim ICE candidate...');
                            sendSignal('candidate', event.candidate);
                        }
                    };

                    peerConnection.onconnectionstatechange = () => {
                        const state = peerConnection.connectionState;
                        updateStatus(`Koneksi: ${state}`);
                        if (state === 'connected') {
                            statusDiv.style.display = 'none'; // Sembunyikan status jika sudah terhubung
                        } else {
                            statusDiv.style.display = 'block'; // Tampilkan lagi jika terputus/gagal
                        }
                    };
                    
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(signalData));
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);

                    updateStatus('Answer dibuat, mengirim ke pengirim...');
                    await sendSignal('answer', answer);

                } else if (signal.type === 'candidate' && peerConnection) {
                    try {
                        await peerConnection.addIceCandidate(new RTCIceCandidate(signalData));
                    } catch(e) {
                        console.error('Error menambah ICE candidate:', e);
                        updateStatus(`Error ICE candidate: ${e.message}`);
                    }
                }
            }
        )
        .subscribe((status, err) => {
             if (status === 'SUBSCRIBED') {
                updateStatus('Menunggu Offer dari pengirim...');
            } else {
                updateStatus(`Gagal subscribe: ${err?.message || 'error'}`);
            }
        });
    }

    function initializeFpvConnection() {
        // Ambil token dari path URL, contoh: "situs.com/token123" -> "token123"
        const pathParts = window.location.pathname.split('/').filter(Boolean);
        sessionId = pathParts.length > 0 ? pathParts[pathParts.length - 1] : null;

        if (!sessionId) {
            updateStatus("Error: Session ID (token) tidak ditemukan di URL.");
            // Non-aktifkan FPV jika tidak ada ID, tapi jangan tampilkan alert agar tidak mengganggu
            console.error("Tidak dapat menemukan Session ID di URL. FPV tidak akan aktif.");
            return;
        }

        updateStatus(`Mencoba terhubung ke sesi FPV: ${sessionId}`);
        subscribeToSignals();
    }

    // Panggil fungsi inisialisasi untuk memulai koneksi FPV
    initializeFpvConnection();
});