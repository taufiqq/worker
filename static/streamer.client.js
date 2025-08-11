// File: public/streamer.client.js

document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('startButton');
    const localVideo = document.getElementById('localVideo');
    const sessionIdDisplay = document.getElementById('sessionIdDisplay');
    const statusDiv = document.getElementById('status');

    let peerConnection;
    let localStream;
    let ws; // Variabel untuk koneksi WebSocket

    const updateStatus = (message) => {
        console.log(message);
        statusDiv.textContent = `Status: ${message}`;
    };

    // 1. Baca Session ID (id_mobil) dan Stream Secret yang disuntikkan oleh server
    const pathSegments = window.location.pathname.split('/');
    const sessionId = pathSegments[pathSegments.length - 1]; // Ambil ID dari segmen URL terakhir
    const streamSecret = window.WEBRTC_STREAM_SECRET;

    sessionIdDisplay.textContent = sessionId;
    startButton.disabled = false;

    const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

    // 2. Fungsi untuk mengirim sinyal melalui WebSocket
    function sendSignal(type, data) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type, data }));
        }
    }

    // 3. Fungsi untuk membuat koneksi WebSocket (dengan otentikasi)
    function setupWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // URL WebSocket sekarang menyertakan streamSecret sebagai parameter 'auth'
        const wsUrl = `${protocol}//${window.location.host}/ws/${sessionId}?auth=${streamSecret}`;

        updateStatus(`Menghubungkan ke ${wsUrl}`);
        ws = new WebSocket(wsUrl);

        ws.onopen = async () => {
            updateStatus('Koneksi WebSocket terbuka. Membuat dan mengirim offer...');
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            sendSignal('offer', offer);
        };

        ws.onmessage = async (event) => {
            const signal = JSON.parse(event.data);
            updateStatus(`Menerima sinyal: ${signal.type}`);

            if (signal.type === 'answer') {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.data));
            } else if (signal.type === 'candidate') {
                await peerConnection.addIceCandidate(new RTCIceCandidate(signal.data));
            }
        };

        ws.onclose = (event) => updateStatus(`Koneksi WebSocket ditutup. Kode: ${event.code}, Alasan: ${event.reason || 'Tidak diketahui'}`);
        ws.onerror = (err) => updateStatus(`WebSocket Error: ${err.message || 'Tidak diketahui'}`);
    }

    // 4. Logika saat tombol "Start" diklik
    startButton.onclick = async () => {
        startButton.disabled = true;
        updateStatus('Memulai kamera...');

        try {
            const constraints = {
                video: { width: { exact: 640 }, height: { exact: 360 }, frameRate: 24, facingMode: "environment" },
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

            setupWebSocket(); // Mulai koneksi WebSocket setelah peer disiapkan
        } catch (error) {
            updateStatus(`Error: ${error.message}`);
            startButton.disabled = false;
        }
    };
});