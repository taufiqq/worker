// File: src/index.js (Struktur Hibrida: DO di dalam, Rute di luar)

import { Hono } from 'hono';

// ==========================================================
// 1. DEFINISI KELAS DURABLE OBJECT (LANGSUNG DI SINI)
// Ini adalah perubahan inti untuk mengatasi masalah build.
// ==========================================================
export class WebSocketDO {
    constructor(state) {
        this.state = state;
        this.sockets = new Set();
    }
    async fetch(request) {
        const upgradeHeader = request.headers.get('Upgrade');
        if (!upgradeHeader || upgradeHeader !== 'websocket') {
            return new Response('Expected Upgrade: websocket', { status: 426 });
        }
        const [client, server] = Object.values(new WebSocketPair());
        this.handleSession(server);
        return new Response(null, { status: 101, webSocket: client });
    }
    handleSession(socket) {
        socket.accept();
        this.sockets.add(socket);
        socket.addEventListener('message', event => { this.broadcast(socket, event.data); });
        const closeOrErrorHandler = () => { this.sockets.delete(socket); };
        socket.addEventListener('close', closeOrErrorHandler);
        socket.addEventListener('error', closeOrErrorHandler);
    }
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
// 2. IMPOR HANDLER RUTE (STRUKTUR ANDA TETAP SAMA)
// Kita tetap menjaga kerapian rute dengan mengimpornya dari file lain.
// ==========================================================
import { handleWebSocketUpgrade } from './routes/websocket.js';
import { adminAuth } from './middleware/adminAuth.js';
import { handleAdminPage } from './routes/admin.js';
import adminApiRoutes from './routes/adminApi.js';
import { handleTokenClaim } from './routes/token.js';
import { handleVideoStreamPage } from './routes/video.js';

// ==========================================================
// 3. INISIALISASI DAN PENDAFTARAN RUTE
// Tidak ada yang berubah di sini, tetap bersih.
// ==========================================================
const app = new Hono();

app.get('/admin', adminAuth, handleAdminPage);
app.route('/api/admin', adminApiRoutes);
app.get('/video/:id_mobil', adminAuth, handleVideoStreamPage);
app.get('/:token', handleTokenClaim);

// Rute WebSocket tetap menggunakan handler terpisahnya
app.get('/ws/:sessionId', handleWebSocketUpgrade);

// Rute fallback untuk aset statis (paling akhir)
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw));


// ==========================================================
// 4. EKSPOR UTAMA (Eksplisit dan Aman)
// ==========================================================
export default {
  fetch: app.fetch,
  // Ekspor kelas DO yang sekarang sudah didefinisikan di file ini
  WebSocketDO: WebSocketDO,
};