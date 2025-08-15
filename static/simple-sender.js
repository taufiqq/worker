// --- START OF FILE public/simple-sender.js ---
document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('startButton');
    const localVideo = document.getElementById('localVideo');
    const statusDiv = document.getElementById('status');
    const sessionIdDisplay = document.getElementById('sessionId');

    const sessionId = window.location.pathname.split('/')[1];
    sessionIdDisplay.textContent = sessionId;

    let ws;
    let peerConnection;
    const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    
    const updateStatus = msg => {
        console.log(msg);
        statusDiv.textContent = `Status: ${msg}`;
    };

    function connectWebSocket() {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${proto}//${window.location.host}/ws-simple/${sessionId}?role=sender`;
        updateStatus(`Connecting to WebSocket at ${wsUrl}`);
        ws = new WebSocket(wsUrl);

        ws.onopen = async () => {
            updateStatus('WebSocket Connected. Creating Peer Connection and Offer...');
            peerConnection = new RTCPeerConnection(configuration);

            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            localVideo.srcObject = stream;
            stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));
            
            peerConnection.onicecandidate = event => {
                if (event.candidate) {
                    ws.send(JSON.stringify({ type: 'candidate', data: event.candidate }));
                }
            };

            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            ws.send(JSON.stringify({ type: 'offer', data: offer }));
            updateStatus('Offer sent. Waiting for answer...');
        };

        ws.onmessage = async (event) => {
            const signal = JSON.parse(event.data);
            updateStatus(`Signal received: ${signal.type}`);
            if (signal.type === 'answer') {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.data));
            } else if (signal.type === 'candidate') {
                await peerConnection.addIceCandidate(new RTCIceCandidate(signal.data));
            }
        };

        ws.onclose = () => updateStatus('WebSocket Disconnected.');
        ws.onerror = (err) => updateStatus(`WebSocket Error: ${err.message}`);
    }

    startButton.onclick = () => {
        startButton.disabled = true;
        connectWebSocket();
    };
});