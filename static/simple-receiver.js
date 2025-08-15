document.addEventListener('DOMContentLoaded', () => {
    // ... (kode untuk elemen HTML dan status tetap sama) ...

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws-simple/${sessionId}?role=receiver`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        updateStatus('WebSocket Connected. Waiting for signal...');
        
        // --- INTI DARI SIMPLE-PEER ---
        const peer = new SimplePeer({
            initiator: false,
            trickle: false
        });

        // Terima sinyal dari sender
        ws.onmessage = event => {
            updateStatus('Received signal data...');
            peer.signal(JSON.parse(event.data));
        };
        
        // Kirim sinyal balasan ke sender
        peer.on('signal', data => {
            updateStatus('Sending signal data back...');
            ws.send(JSON.stringify(data));
        });

        // INI DIA! Saat stream video datang
        peer.on('stream', stream => {
            updateStatus('Stream received!');
            remoteVideo.srcObject = stream;
        });

        peer.on('connect', () => {
            updateStatus('Peer Connected!');
        });
        
        peer.on('error', err => updateStatus(`Error: ${err.message}`));
    };
    ws.onerror = err => updateStatus(`WebSocket Error: ${err.message}`);
    ws.onclose = () => updateStatus('WebSocket Disconnected.');
});