// --- START OF FILE public/simple-receiver.js ---
document.addEventListener('DOMContentLoaded', () => {
    const remoteVideo = document.getElementById('remoteVideo');
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
        const wsUrl = `${proto}//${window.location.host}/ws-simple/${sessionId}?role=receiver`;
        updateStatus(`Connecting to WebSocket at ${wsUrl}`);
        ws = new WebSocket(wsUrl);

        ws.onopen = () => updateStatus('WebSocket Connected. Waiting for offer...');
        ws.onclose = () => updateStatus('WebSocket Disconnected.');
        ws.onerror = (err) => updateStatus(`WebSocket Error: ${err.message}`);

        ws.onmessage = async (event) => {
            const signal = JSON.parse(event.data);
            updateStatus(`Signal received: ${signal.type}`);

            if (signal.type === 'offer') {
                peerConnection = new RTCPeerConnection(configuration);
                
                peerConnection.ontrack = (event) => {
                    updateStatus('Video track received!');
                    remoteVideo.srcObject = event.streams[0];
                };

                peerConnection.onicecandidate = (e) => {
                    if (e.candidate) {
                        ws.send(JSON.stringify({ type: 'candidate', data: e.candidate }));
                    }
                };
                
                await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.data));
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                ws.send(JSON.stringify({ type: 'answer', data: answer }));
                updateStatus('Answer sent.');

            } else if (signal.type === 'candidate' && peerConnection) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(signal.data));
            }
        };
    }
    connectWebSocket();
});