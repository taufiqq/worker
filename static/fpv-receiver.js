// fpv-receiver.js

document.addEventListener('DOMContentLoaded', () => {
    const remoteVideo = document.getElementById('remoteVideo');
    const statusDiv = document.getElementById('status');

    if (!remoteVideo || !statusDiv) {
        console.error("Elemen video FPV (#remoteVideo atau #status) tidak ditemukan. Pastikan HTML benar.");
        return;
    }

    let peerConnection;
    let sessionId;
    let ws; // Variabel WebSocket

    const configuration = {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    };

    const updateStatus = (message) => {
        console.log(message);
        statusDiv.textContent = `Status: ${message}`;
    };

    // --- FUNGSI SIGNALING BARU DENGAN WEBSOCKET ---
    async function sendSignal(type, data) {
        if (!sessionId) return;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type, data }));
        } else {
             updateStatus('Error: WebSocket tidak terhubung. Gagal mengirim sinyal.');
        }
    }

    function setupWebSocket() {
        if (!sessionId) return;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/${sessionId}`;
        
        updateStatus(`Menghubungkan ke server signaling: ${wsUrl}`);
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            updateStatus('Terhubung ke server signaling. Menunggu offer dari pengirim...');
        };

        ws.onmessage = async (event) => {
            const signal = JSON.parse(event.data);
            
            updateStatus(`Menerima sinyal tipe: ${signal.type}`);

            if (signal.type === 'offer') {
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

                peerConnection.onicecandidate = e => {
                    if (e.candidate) {
                        updateStatus('Mengirim ICE candidate...');
                        sendSignal('candidate', e.candidate);
                    }
                };

                peerConnection.onconnectionstatechange = () => {
                    const state = peerConnection.connectionState;
                    updateStatus(`Koneksi: ${state}`);
                    if (state === 'connected') {
                        statusDiv.style.display = 'none';
                    } else {
                        statusDiv.style.display = 'block';
                    }
                };
                
                await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.data));
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);

                updateStatus('Answer dibuat, mengirim ke pengirim...');
                await sendSignal('answer', answer);

            } else if (signal.type === 'candidate' && peerConnection) {
                try {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(signal.data));
                } catch(e) {
                    console.error('Error menambah ICE candidate:', e);
                    updateStatus(`Error ICE candidate: ${e.message}`);
                }
            } else if (signal.error) {
                updateStatus(`Error dari server: ${signal.error}`);
            }
        };

        ws.onclose = () => {
            updateStatus('Koneksi WebSocket ditutup. Coba refresh halaman untuk terhubung kembali.');
        };
        
        ws.onerror = (error) => {
            console.error('WebSocket Error:', error);
            updateStatus('Error pada koneksi WebSocket.');
        };
    }

    function initializeFpvConnection() {
        const pathParts = window.location.pathname.split('/').filter(Boolean);
        sessionId = pathParts.length > 0 ? pathParts[pathParts.length - 1] : null;

        if (!sessionId) {
            updateStatus("Error: Session ID (token) tidak ditemukan di URL.");
            return;
        }

        updateStatus(`Mencoba terhubung ke sesi FPV: ${sessionId}`);
        // Mulai koneksi WebSocket
        setupWebSocket();
    }

    initializeFpvConnection();
});