// File: public/fpv-receiver.js

document.addEventListener('DOMContentLoaded', () => {
    const remoteVideo = document.getElementById('remoteVideo');
    const statusDiv = document.getElementById('status');

    let peerConnection;
    let ws; // Variabel WebSocket

    const updateStatus = (message) => {
        console.log(message);
        statusDiv.textContent = `Status: ${message}`;
    };

    // 1. Ambil Session ID dari URL
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const sessionId = pathParts.length > 0 ? pathParts[pathParts.length - 1] : null;

    if (!sessionId) {
        updateStatus("Error: Session ID (token) tidak ditemukan di URL.");
        return;
    }

    const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

    // 2. Fungsi untuk mengirim sinyal melalui WebSocket
    function sendSignal(type, data) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type, data }));
        }
    }

    // 3. Fungsi untuk membuat koneksi WebSocket
    function setupWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/${sessionId}`;
        
        updateStatus(`Mencoba terhubung ke sesi FPV: ${sessionId}`);
        ws = new WebSocket(wsUrl);

        ws.onopen = () => updateStatus('Terhubung. Menunggu sinyal dari streamer...');
        ws.onclose = () => updateStatus('Koneksi terputus. Refresh halaman untuk mencoba lagi.');
        ws.onerror = (err) => updateStatus(`WebSocket Error: ${err.message || 'Tidak diketahui'}`);

        ws.onmessage = async (event) => {
            const signal = JSON.parse(event.data);
            updateStatus(`Menerima sinyal: ${signal.type}`);

            if (signal.type === 'offer') {
                if (peerConnection) peerConnection.close();
                peerConnection = new RTCPeerConnection(configuration);

                peerConnection.ontrack = event => {
                    updateStatus('Stream video diterima!');
                    if (remoteVideo.srcObject !== event.streams[0]) {
                        remoteVideo.srcObject = event.streams[0];
                    }
                };
                peerConnection.onicecandidate = e => {
                    if (e.candidate) sendSignal('candidate', e.candidate);
                };
                peerConnection.onconnectionstatechange = () => {
                    updateStatus(`Status koneksi peer: ${peerConnection.connectionState}`);
                    statusDiv.style.display = peerConnection.connectionState === 'connected' ? 'none' : 'block';
                };
                
                await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.data));
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                sendSignal('answer', answer);

            } else if (signal.type === 'candidate' && peerConnection) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(signal.data));
            }
        };
    }

    // 4. Mulai koneksi
    setupWebSocket();
});