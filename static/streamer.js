// streamer.js
// Salin dan ganti seluruh isi file ini.

document.addEventListener('DOMContentLoaded', async () => {
    const localVideo = document.getElementById('localVideo');
    const statusDiv = document.getElementById('status');
    let peerConnection;
    let ws;

    // --- Konfigurasi ---
    const VIDEO_CONSTRAINTS = {
        width: { ideal: 320 }, 
        height: { ideal: 640 },
        frameRate: { ideal: 24 }
    };
    const STUN_SERVERS = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };

    function updateStatus(message) {
        console.log(message);
        statusDiv.textContent = `Status: ${message}`;
    }

    // 1. Dapatkan id_mobil dari URL
    const pathParts = window.location.pathname.split('/');
    const id_mobil = pathParts[pathParts.length - 1];

    if (!id_mobil) {
        updateStatus("Error: id_mobil tidak ditemukan di URL.");
        return;
    }
    updateStatus(`ID Mobil terdeteksi: ${id_mobil}`);

    // 2. Mulai kamera
    let localStream;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: VIDEO_CONSTRAINTS, audio: false });
        localVideo.srcObject = localStream;
        updateStatus("Kamera berhasil diakses.");
    } catch (error) {
        updateStatus(`Gagal mengakses kamera: ${error.message}`);
        console.error("getUserMedia error:", error);
        return;
    }
    if (!window.ADMIN_CREDENTIALS || !window.ADMIN_CREDENTIALS.user) {
        updateStatus("Error: Kredensial admin tidak ditemukan. Gagal memulai koneksi.");
        return;
    }
    
    // 3. Hubungkan ke WebSocket Server (Durable Object)
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const { user, pass } = window.ADMIN_CREDENTIALS;
    const wsUrl = `${wsProtocol}//${window.location.host}/api/video/ws/${id_mobil}?user=${encodeURIComponent(user)}&pass=${encodeURIComponent(pass)}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        // --- PERUBAHAN UTAMA DI SINI ---
        // Jangan mulai WebRTC dulu. Tunggu aba-aba dari server.
        updateStatus("Terhubung ke server sinyal. Menunggu viewer terhubung...");
    };
    
    ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        console.log("Menerima pesan:", data);

        // --- LOGIKA BARU DI SINI ---
        if (data.type === 'initiate-webrtc') {
            updateStatus("Viewer terhubung! Memulai koneksi WebRTC...");
            startWebRTC();
        } else if (data.type === 'answer') {
            if (!peerConnection || peerConnection.signalingState !== 'have-local-offer') {
                console.warn('Received an answer without having a local offer. Ignoring.');
                return;
            }
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.payload));
            updateStatus("Koneksi WebRTC berhasil dibuat! Streaming aktif.");
        } else if (data.type === 'ice-candidate') {
            if (!peerConnection) return;
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.payload));
        } else if (data.type === 'viewer-disconnected') {
            updateStatus("Viewer terputus. Menunggu koneksi baru...");
            // Cukup tutup koneksi peer yang lama. 
            // Koneksi baru akan diinisiasi oleh pesan 'initiate-webrtc' berikutnya.
            if (peerConnection) {
                peerConnection.close();
                peerConnection = null;
            }
        }
    };

    ws.onclose = () => {
        updateStatus("Koneksi ke server sinyal terputus.");
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
    };
    ws.onerror = (error) => {
        updateStatus("Error koneksi WebSocket.");
        console.error("WebSocket Error:", error);
    };

    function startWebRTC() {
        if (peerConnection) {
            peerConnection.close();
        }
        peerConnection = new RTCPeerConnection(STUN_SERVERS);

        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        peerConnection.onicecandidate = (event) => {
            if (event.candidate && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ice-candidate', payload: event.candidate }));
            }
        };

        peerConnection.createOffer()
            .then(offer => peerConnection.setLocalDescription(offer))
            .then(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    console.log("Mengirim offer...");
                    ws.send(JSON.stringify({ type: 'offer', payload: peerConnection.localDescription }));
                    updateStatus("Offer terkirim. Menunggu jawaban dari viewer...");
                }
            })
            .catch(e => updateStatus(`Error membuat offer: ${e}`));
    }
});