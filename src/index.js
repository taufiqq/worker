// src/index.js - Titik Masuk dan Router Utama

import { Hono } from 'hono';

// Impor komponen yang relevan
import { WebSocketDO } from './durable-objects/websocket.do.js'; // <-- IMPOR DO BARU
import { adminAuth } from './middleware/adminAuth.js';
import { handleAdminPage } from './routes/admin.js';
import adminApiRoutes from './routes/adminApi.js';
import { handleTokenClaim } from './routes/token.js';
import { handleVideoStreamPage } from './routes/video.js';

// Inisialisasi aplikasi Hono
const app = new Hono();

// ==========================================================
// PENDEFINISIAN RUTE (Perakitan)
// ==========================================================

// --- RUTE #1: Admin Panel ---
app.get('/admin', adminAuth, handleAdminPage);

// --- RUTE #2: Admin API ---
app.route('/api/admin', adminApiRoutes);

// Rute ini akan menangkap URL seperti /video/123, /video/456, dll.
app.get('/video/:id_mobil', adminAuth, handleVideoStreamPage);

// --- RUTE BARU: WebSocket Signaling ---
// Rute ini akan menangani koneksi WebSocket. Klien akan terhubung ke wss://domain.com/ws/SESSION_ID
app.get('/ws/:sessionId', c => {
    // Dapatkan ID unik untuk Durable Object dari sessionId.
    // Pastikan ID ini selalu memiliki panjang yang sama untuk keamanan.
    const sessionId = c.req.param('sessionId');
    if (sessionId.length < 10) { // Contoh validasi sederhana
      return new Response("Invalid Session ID", { status: 400 });
    }
    const id = c.env.WEBSOCKET_DO.idFromName(sessionId);
    const stub = c.env.WEBSOCKET_DO.get(id);

    // Teruskan permintaan ke Durable Object untuk di-upgrade.
    return stub.fetch(c.req.raw);
});


// --- RUTE #3: Token Pengguna (Generik) ---
app.get('/:token', handleTokenClaim);

// --- RUTE #4: Fallback untuk Aset Statis dan Root ---
app.get('*', (c) => {
    return c.env.ASSETS.fetch(c.req.raw);
});

// --- Ekspor Worker ---
export default {
  fetch: app.fetch,
  // Ekspor Durable Object kita agar Cloudflare tahu cara membuatnya.
  WebSocketDO: WebSocketDO, 
};