document.addEventListener('DOMContentLoaded', () => {
    // ... (kode untuk ambil video, status, dll. tetap sama) ...
    
    // ... (kode websocket Anda) ...
    // ws.onopen, ws.onclose, ws.onmessage
    
    startButton.onclick = async () => {
        startButton.disabled = true;
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        localVideo.srcObject = stream;
        
        // Buat koneksi WebSocket
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${proto}//${window.location.host}/ws-simple/${sessionId}?role=sender`;
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            updateStatus('WebSocket Connected. Creating peer...');
            
            // --- INTI DARI SIMPLE-PEER ---
            const peer = new SimplePeer({
                initiator: true, // Sender adalah initiator
                stream: stream,
                trickle: false // Lebih simpel untuk memulai, mengirim semua kandidat sekaligus
            });

            // Kirim sinyal ke receiver via WebSocket
            peer.on('signal', data => {
                updateStatus('Sending signal data...');
                ws.send(JSON.stringify(data));
            });
            
            // Terima sinyal dari receiver
            ws.onmessage = event => {
                updateStatus('Received signal data...');
                peer.signal(JSON.parse(event.data));
            };

            peer.on('connect', () => {
                updateStatus('Peer Connected!');
            });
            
            peer.on('error', err => updateStatus(`Error: ${err.message}`));
        };
        ws.onerror = err => updateStatus(`WebSocket Error: ${err.message}`);
        ws.onclose = () => updateStatus('WebSocket Disconnected.');
    };
});