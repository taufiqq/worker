// File: src/durable-objects/websocket.do.js

/**
 * WebSocketDO mengelola koneksi WebSocket untuk satu sesi WebRTC.
 * Setiap sesi (ditentukan oleh sessionId/token) akan mendapatkan instance DO ini.
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
        // Hanya izinkan permintaan upgrade WebSocket.
        const upgradeHeader = request.headers.get('Upgrade');
        if (!upgradeHeader || upgradeHeader !== 'websocket') {
            return new Response('Expected Upgrade: websocket', { status: 426 });
        }

        // Membuat pasangan WebSocket. `client` dikirim ke browser, `server` kita kelola di sini.
        const [client, server] = Object.values(new WebSocketPair());

        // Menangani logika koneksi untuk WebSocket sisi server.
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
        // Terima koneksi untuk memulai komunikasi.
        socket.accept();
        // Tambahkan koneksi baru ini ke daftar koneksi aktif.
        this.sockets.add(socket);

        // Listener untuk pesan yang masuk dari klien.
        socket.addEventListener('message', event => {
            // Siarkan pesan yang diterima ke semua klien lain di sesi ini.
            this.broadcast(socket, event.data);
        });

        // Listener untuk saat koneksi ditutup atau error.
        const closeOrErrorHandler = () => {
            // Hapus socket dari daftar koneksi aktif.
            this.sockets.delete(socket);
        };
        socket.addEventListener('close', closeOrErrorHandler);
        socket.addEventListener('error', closeOrErrorHandler);
    }

    /**
     * Menyiarkan pesan ke semua klien yang terhubung KECUALI pengirimnya.
     * @param {WebSocket} sender - WebSocket pengirim pesan.
     * @param {string} message - Pesan (dalam bentuk string) yang akan disiarkan.
     */
    broadcast(sender, message) {
        // Iterasi melalui semua socket yang terhubung dalam sesi ini.
        for (const socket of this.sockets) {
            // Kirim pesan jika socket bukan pengirimnya dan dalam keadaan OPEN.
            if (socket !== sender && socket.readyState === WebSocket.OPEN) {
                try {
                    socket.send(message);
                } catch (error) {
                    console.error("Gagal mengirim pesan ke socket:", error);
                    // Hapus socket yang bermasalah agar tidak dicoba lagi.
                    this.sockets.delete(socket);
                }
            }
        }
    }
}