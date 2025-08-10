// src/durable-objects/websocket.do.js

/**
 * WebSocketDO adalah Durable Object yang mengelola koneksi WebSocket untuk satu sesi WebRTC.
 * Setiap sesi (ditentukan oleh sessionId/token) akan memiliki instance DO-nya sendiri.
 */
export class WebSocketDO {
    constructor(state) {
        this.state = state;
        // Gunakan Set untuk menyimpan koneksi WebSocket agar mudah ditambahkan/dihapus.
        this.sockets = new Set();
    }

    /**
     * Metode ini dipanggil saat ada permintaan HTTP ke Durable Object.
     * Kita akan menggunakannya untuk meng-upgrade koneksi HTTP menjadi WebSocket.
     */
    async fetch(request) {
        // Cek apakah permintaan adalah permintaan upgrade WebSocket.
        const upgradeHeader = request.headers.get('Upgrade');
        if (!upgradeHeader || upgradeHeader !== 'websocket') {
            return new Response('Expected Upgrade: websocket', { status: 426 });
        }

        // Buat pasangan WebSocket. server akan kita kelola, client kita kirim ke pengguna.
        const [client, server] = Object.values(new WebSocketPair());

        // Terima koneksi WebSocket di sisi server.
        await this.handleSession(server);

        // Kembalikan sisi klien dari WebSocket ke pengguna yang terhubung.
        return new Response(null, {
            status: 101,
            webSocket: client,
        });
    }

    /**
     * Menangani logika untuk satu koneksi WebSocket (satu klien).
     * @param {WebSocket} server - Sisi server dari koneksi WebSocket.
     */
    async handleSession(server) {
        // Terima koneksi untuk memulai.
        server.accept();
        
        // Tambahkan koneksi baru ini ke dalam set koneksi aktif.
        this.sockets.add(server);

        // Atur listener untuk pesan yang masuk.
        server.addEventListener('message', event => {
            try {
                // Siarkan pesan yang diterima ke semua koneksi lain di sesi ini.
                this.broadcast(server, event.data);
            } catch (err) {
                console.error("Gagal memproses atau menyiarkan pesan:", err);
                server.send(JSON.stringify({ error: 'Pesan tidak valid' }));
            }
        });

        // Atur listener untuk saat koneksi ditutup.
        server.addEventListener('close', () => {
            this.sockets.delete(server); // Hapus koneksi dari set.
            console.log(`WebSocket ditutup. Sisa koneksi: ${this.sockets.size}`);
        });
        
        // Atur listener untuk error.
        server.addEventListener('error', (err) => {
            console.error("WebSocket error:", err);
            this.sockets.delete(server); // Hapus juga saat error.
        });
    }

    /**
     * Menyiarkan pesan ke semua klien yang terhubung KECUALI pengirimnya.
     * @param {WebSocket} sender - WebSocket pengirim pesan.
     * @param {string} message - Pesan yang akan disiarkan.
     */
    broadcast(sender, message) {
        // Kita tidak perlu mem-parse pesannya, cukup teruskan saja.
        // Ini membuat DO menjadi "agnostik" terhadap konten pesan.
        for (const socket of this.sockets) {
            // Kirim hanya jika socket bukan pengirimnya dan dalam keadaan OPEN.
            if (socket !== sender && socket.readyState === WebSocket.OPEN) {
                socket.send(message);
            }
        }
    }
}