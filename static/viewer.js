// webrtc-viewer.js

document.addEventListener('DOMContentLoaded', () => {
    // Pastikan halaman ini memiliki kredensial yang disuntikkan
    if (!window.id_mobil) {
        console.warn("id_mobil tidak ditemukan. WebRTC tidak akan dimulai.");
        return;
    }

    const remoteVideo = document.getElementById('remoteVideo');
    const statusDiv = document.getElementById('status');
    let peerConnection;
    let ws;

    // --- Konfigurasi ---
    const STUN_SERVERS = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };
    
    function updateStatus(message) {
        console.log(message);
        if (statusDiv) {
            statusDiv.textContent = `Status: ${message}`;
        }
    }

    function connect() {
        const { id_mobil } = window;
        updateStatus(`Menghubungkan ke stream video untuk mobil ID: ${id_mobil}`);

        const token = window.location.pathname.substring(1);
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}/api/video/ws/${id_mobil}?token=${token}`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            updateStatus("Terhubung ke server sinyal. Menunggu stream video...");
            setupPeerConnection();
        };

        ws.onmessage = async (event) => {
            const data = JSON.parse(event.data);
            console.log("Menerima pesan:", data);

            if (!peerConnection) {
                setupPeerConnection();
            }

            if (data.type === 'offer') {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.payload));
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                if (ws.readyState === WebSocket.OPEN) {
                    console.log("Mengirim answer...");
                    ws.send(JSON.stringify({ type: 'answer', payload: answer }));
                }
            } else if (data.type === 'ice-candidate') {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.payload));
            }
        };
        
        ws.onclose = () => {
            updateStatus("Koneksi video terputus. Mencoba menghubungkan kembali dalam 5 detik...");
            if (peerConnection) {
                peerConnection.close();
                peerConnection = null;
            }
            // Hapus stream video lama jika ada
            if (remoteVideo.srcObject) {
                 remoteVideo.srcObject.getTracks().forEach(track => track.stop());
                 remoteVideo.srcObject = null;
            }
            setTimeout(connect, 5000);
        };

        ws.onerror = (error) => {
            updateStatus("Error koneksi video.");
            console.error("WebSocket Error:", error);
        };
    }
    
    function setupPeerConnection() {
        if (peerConnection) {
            peerConnection.close();
        }
        peerConnection = new RTCPeerConnection(STUN_SERVERS);

        // Saat track video diterima, tampilkan di elemen <video>
        peerConnection.ontrack = (event) => {
            updateStatus("Stream video diterima!");
            if (remoteVideo) {
                // Langkah 1: Tetapkan sumber stream seperti biasa
                remoteVideo.srcObject = event.streams[0];

                // Langkah 2: Beri perintah eksplisit untuk memutar video
                // Ini mengatasi masalah di mana browser tidak memulai pemutaran otomatis
                const playPromise = remoteVideo.play();
                
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        // Autoplay dicegah oleh browser. Ini umum terjadi.
                        // Biasanya karena pengguna belum berinteraksi dengan halaman.
                        console.error("Autoplay gagal:", error);
                        updateStatus("Stream diterima. Klik video untuk memulai.");
                        // Anda bisa menambahkan overlay "klik untuk memutar" di sini
                    });
                }
            }
        };

        // Kirim ICE candidates yang dihasilkan ke peer lain
        peerConnection.onicecandidate = (event) => {
            if (event.candidate && ws.readyState === WebSocket.OPEN) {
                console.log("Mengirim ICE candidate...");
                ws.send(JSON.stringify({ type: 'ice-candidate', payload: event.candidate }));
            }
        };
    }

    connect(); // Mulai proses koneksi
});