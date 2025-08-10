// public/streamer.client.js

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

    // --- BACA SESSION ID DARI SERVER ---
    if (!window.WEBRTC_SESSION_ID) {
        updateStatus('ERROR: Session ID tidak ditemukan. Halaman tidak dimuat dengan benar.');
        sessionIdDisplay.textContent = 'Error! Gagal memuat ID.';
        document.body.style.backgroundColor = '#ffcdd2';
        return;
    }
    const sessionId = window.WEBRTC_SESSION_ID;
    sessionIdDisplay.textContent = sessionId;
    startButton.disabled = false;

    const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    
    // --- FUNGSI SIGNALING BARU DENGAN WEBSOCKET ---
    function sendSignal(type, data) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            const message = JSON.stringify({ type, data });
            ws.send(message);
        } else {
            updateStatus('Error: WebSocket tidak terhubung. Gagal mengirim sinyal.');
        }
    }
    
    function setupWebSocket() {
        // Tentukan protokol (wss untuk https, ws untuk http)
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/${sessionId}`;
        
        updateStatus(`Menghubungkan ke server signaling: ${wsUrl}`);
        ws = new WebSocket(wsUrl);

        ws.onopen = async () => {
            updateStatus('Terhubung ke server signaling. Mengirim offer...');
            // Kirim offer setelah koneksi WebSocket berhasil dibuka
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            sendSignal('offer', offer);
        };

        ws.onmessage = async (event) => {
            const signal = JSON.parse(event.data);
            
            updateStatus(`Menerima sinyal tipe: ${signal.type}`);

            if (signal.type === 'answer') {
                if (peerConnection.signalingState !== 'stable') {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.data));
                    updateStatus('Answer diterima.');
                }
            } else if (signal.type === 'candidate') {
                // Antrian tidak diperlukan lagi karena WebSocket memastikan urutan
                await peerConnection.addIceCandidate(new RTCIceCandidate(signal.data));
            } else if (signal.error) {
                updateStatus(`Error dari server: ${signal.error}`);
            }
        };

        ws.onclose = () => {
            updateStatus('Koneksi WebSocket ditutup.');
        };
        
        ws.onerror = (error) => {
            console.error('WebSocket Error:', error);
            updateStatus('Error pada koneksi WebSocket.');
        };
    }

    startButton.onclick = async () => {
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

            // Buat PeerConnection
            peerConnection = new RTCPeerConnection(configuration);
            localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
            
            peerConnection.onicecandidate = event => {
                if (event.candidate) {
                    sendSignal('candidate', event.candidate);
                }
            };
            
            peerConnection.onconnectionstatechange = () => {
                updateStatus(`Connection state: ${peerConnection.connectionState}`);
            };

            // Buat dan atur koneksi WebSocket. Offer akan dikirim di dalam `ws.onopen`.
            setupWebSocket();

        } catch (error) {
            updateStatus(`Error: ${error.message}`);
            startButton.disabled = false;
        }
    };
});