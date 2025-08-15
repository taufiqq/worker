// File: public/fpv-receiver.js

document.addEventListener('DOMContentLoaded', () => {
    const remoteVideo = document.getElementById('remoteVideo');
    const statusDiv = document.getElementById('status');

    let peerConnection;
    let ws; // Variabel WebSocket

    const updateStatus = (message) => {
//        console.log(message);
        statusDiv.textContent = `Status: ${message}`;
    };

    // 1. Ambil data sesi yang disuntikkan dari objek global
    if (!window.MQTT_CREDENTIALS || !window.MQTT_CREDENTIALS.id_mobil) {
        updateStatus("Error: Data sesi tidak lengkap. Harap akses melalui URL token yang valid.");
        return;
    }

    const sessionId = window.MQTT_CREDENTIALS.id_mobil;
    const pathSegments = window.location.pathname.split('/');
    const authToken = pathSegments[pathSegments.length - 1]; // Ambil token dari segmen URL terakhir


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
        // URL WebSocket sekarang menggunakan id_mobil dan authToken viewer
        const wsUrl = `${protocol}//${window.location.host}/ws/${sessionId}?auth=${authToken}`;
        
        updateStatus(`Mencoba terhubung ke sesi FPV: ${sessionId}`);
        ws = new WebSocket(wsUrl);

        ws.onopen = () => updateStatus('Terhubung. Menunggu sinyal video dari streamer...');
        ws.onclose = (event) => updateStatus(`Koneksi terputus. Kode: ${event.code}. Refresh halaman untuk mencoba lagi.`);
        ws.onerror = (err) => updateStatus(`WebSocket Error: ${err.message || 'Tidak diketahui'}`);

        ws.onmessage = async (event) => {
            const signal = JSON.parse(event.data);
            updateStatus(`Menerima sinyal: ${signal.type}`);

            if (signal.type === 'offer') {
                if (peerConnection) {
                    peerConnection.close();
                }
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
                };
                
                await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.data));
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                sendSignal('answer', answer);

            } else if (signal.type === 'candidate' && peerConnection) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(signal.data));
            } else if (signal.type === 'streamer-disconnected') {
                updateStatus('Streamer telah memutus koneksi. Menunggu untuk terhubung kembali...');
                if (peerConnection) peerConnection.close();
                remoteVideo.srcObject = null;
            }
        };
    }

    // 4. Mulai koneksi
    setupWebSocket();
});