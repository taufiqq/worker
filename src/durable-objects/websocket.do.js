// File: src/durable-objects/websocket.do.js

/**
 * WebSocketDO mengelola koneksi WebSocket untuk satu sesi WebRTC.
 * Setiap sesi (ditentukan oleh sessionId/token) akan mendapatkan instance DO ini.
 * Kata kunci 'export' di depan 'class' sangat penting agar bisa diimpor di file lain.
 */
export class WebSocketDO {
    constructor(state) {
        this.state = state;
        // Menyimpan semua koneksi WebSocket yang aktif untuk sesi ini.
        this.sockets = new Set();
    }

    /**
     * Metode ini dipanggil saat ada permintaan HTTP ke Durable Object.
     * Kita hanya menangani permintaan upgrade ke WebSocket.
     */
    async fetch(request) {
        const upgradeHeader = request.headers.get('Upgrade');
        if (!upgradeHeader || upgradeHeader !== 'websocket') {
            return new Response('Expected Upgrade: websocket', { status: 426 });
        }

        // Membuat pasangan WebSocket.
        const [client, server] = Object.values(new WebSocketPair());
        this.handleSession(server);

        // Mengembalikan respons "Switching Protocols" dengan WebSocket sisi klien.
        return new Response(null, {
            status: 101,
            webSocket: client,
        });
    }

    /**
     * Menangani siklus hidup satu koneksi WebSocket.
     * @param {WebSocket} socket - Sisi server dari koneksi WebSocket.
     */
    handleSession(socket) {
        socket.accept();
        this.sockets.add(socket);

        socket.addEventListener('message', event => {
            this.broadcast(socket, event.data);
        });

        const closeOrErrorHandler = () => {
            this.sockets.delete(socket);
        };
        socket.addEventListener('close', closeOrErrorHandler);
        socket.addEventListener('error', closeOrErrorHandler);
    }

    /**
     * Menyiarkan pesan ke semua klien yang terhubung KECUALI pengirimnya.
     */
    broadcast(sender, message) {
        for (const socket of this.sockets) {
            if (socket !== sender && socket.readyState === WebSocket.OPEN) {
                try {
                    socket.send(message);
                } catch (error) {
                    // Hapus socket yang bermasalah agar tidak dicoba lagi.
                    this.sockets.delete(socket);
                }
            }
        }
    }
}