// File: src/index.js (Struktur Terpadu)

import { Hono } from 'hono';

// ==========================================================
// DEFINISI KELAS DURABLE OBJECT (LANGSUNG DI SINI)
// ==========================================================
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
                    this.sockets.delete(socket);
                }
            }
        }
    }
}


// ==========================================================
// APLIKASI HONO - ROUTER UTAMA
// ==========================================================
const app = new Hono();

// Impor middleware dan handler rute lainnya (jika mereka ada di file terpisah)
import { adminAuth } from './middleware/adminAuth.js';
import { handleAdminPage } from './routes/admin.js';
import adminApiRoutes from './routes/adminApi.js';
import { handleTokenClaim } from './routes/token.js';
import { handleVideoStreamPage } from './routes/video.js';

// Rute Admin Panel
app.get('/admin', adminAuth, handleAdminPage);

// Rute Admin API
app.route('/api/admin', adminApiRoutes);

// Rute untuk menyajikan halaman streamer
app.get('/video/:id_mobil', adminAuth, handleVideoStreamPage);

// RUTE BARU: Menangani Upgrade WebSocket
app.get('/ws/:sessionId', c => {
    const sessionId = c.req.param('sessionId');
    if (!sessionId || sessionId.length < 10) {
      return new Response("Invalid Session ID format", { status: 400 });
    }
    const doId = c.env.WEBSOCKET_DO.idFromName(sessionId);
    const doStub = c.env.WEBSOCKET_DO.get(doId);
    return doStub.fetch(c.req.raw);
});

// Rute untuk klaim token oleh pengguna
app.get('/:token', handleTokenClaim);

// Rute Fallback untuk aset statis (CSS, JS klien, gambar, dll)
app.get('*', (c) => {
    return c.env.ASSETS.fetch(c.req.raw);
});


// ==========================================================
// EKSPOR UTAMA (MENGIKUTI POLA YANG BERHASIL)
// ==========================================================
export default {
  // Menangani semua permintaan HTTP melalui Hono
  fetch: app.fetch,

  // Mendaftarkan kelas Durable Object ke runtime Cloudflare.
  // Nama properti `WebSocketDO` HARUS SAMA PERSIS dengan `class_name` di wrangler.toml
  WebSocketDO: WebSocketDO,
};