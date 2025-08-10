// src/index.js - Titik Masuk dan Router Utama

import { Hono } from 'hono';

// IMPOR KOMPONEN
import { WebSocketDO } from './durable-objects/websocket.do.js'; // PASTIKAN PATH INI BENAR
import { adminAuth } from './middleware/adminAuth.js';
import { handleAdminPage } from './routes/admin.js';
import adminApiRoutes from './routes/adminApi.js';
import { handleTokenClaim } from './routes/token.js';
import { handleVideoStreamPage } from './routes/video.js';

const app = new Hono();

// ==========================================================
// RUTE-RUTE APLIKASI
// ==========================================================

// --- Rute Admin Panel ---
app.get('/admin', adminAuth, handleAdminPage);

// --- Rute Admin API ---
app.route('/api/admin', adminApiRoutes);

// --- Rute Halaman Streamer Video ---
app.get('/video/:id_mobil', adminAuth, handleVideoStreamPage);

// --- Rute WebSocket Signaling ---
app.get('/ws/:sessionId', c => {
    const sessionId = c.req.param('sessionId');
    if (!sessionId || sessionId.length < 10) {
      return new Response("Invalid Session ID", { status: 400 });
    }
    // Dapatkan instance Durable Object berdasarkan nama unik (sessionId)
    const id = c.env.WEBSOCKET_DO.idFromName(sessionId);
    const stub = c.env.WEBSOCKET_DO.get(id);

    // Teruskan permintaan ke Durable Object untuk di-upgrade
    return stub.fetch(c.req.raw);
});

// --- Rute Klaim Token ---
app.get('/:token', handleTokenClaim);

// --- Rute Fallback (untuk aset statis seperti CSS, JS, HTML) ---
app.get('*', (c) => {
    return c.env.ASSETS.fetch(c.req.raw);
});

// ==========================================================
// EKSPOR UTAMA UNTUK CLOUDFLARE WORKERS
// ==========================================================
export default {
  fetch: app.fetch,
  WebSocketDO: WebSocketDO, // <-- BAGIAN PALING PENTING UNTUK MEMPERBAIKI ERROR
};