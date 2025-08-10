// File: src/index.js

import { Hono } from 'hono';

// IMPOR SEMUA KOMPONEN YANG DIPERLUKAN
import { WebSocketDO } from './durable-objects/websocket.do.js';
import { adminAuth } from './middleware/adminAuth.js';
import { handleAdminPage } from './routes/admin.js';
import adminApiRoutes from './routes/adminApi.js';
import { handleTokenClaim } from './routes/token.js';
import { handleVideoStreamPage } from './routes/video.js';

// Inisialisasi aplikasi Hono
const app = new Hono();

// ==========================================================
// DEFINISI RUTE
// ==========================================================

// Rute Admin Panel
app.get('/admin', adminAuth, handleAdminPage);

// Rute Admin API
app.route('/api/admin', adminApiRoutes);

// Rute untuk menyajikan halaman streamer
app.get('/video/:id_mobil', adminAuth, handleVideoStreamPage);

// RUTE BARU: Menangani Upgrade WebSocket
// Klien akan terhubung ke wss://domain-anda.com/ws/SESSION_ID
app.get('/ws/:sessionId', c => {
    const sessionId = c.req.param('sessionId');

    // Validasi sederhana untuk mencegah ID yang tidak valid
    if (!sessionId || sessionId.length < 10) {
      return new Response("Invalid Session ID format", { status: 400 });
    }

    // Dapatkan ID unik untuk Durable Object dari nama sesi.
    const doId = c.env.WEBSOCKET_DO.idFromName(sessionId);
    // Dapatkan "stub" atau perwakilan dari Durable Object tersebut.
    const doStub = c.env.WEBSOCKET_DO.get(doId);

    // Teruskan permintaan ke Durable Object untuk di-upgrade menjadi koneksi WebSocket.
    return doStub.fetch(c.req.raw);
});

// Rute untuk klaim token oleh pengguna
app.get('/:token', handleTokenClaim);

// Rute Fallback untuk aset statis (CSS, JS klien, gambar, dll)
app.get('*', (c) => {
    return c.env.ASSETS.fetch(c.req.raw);
});

// ==========================================================
// EKSPOR UTAMA (PALING PENTING!)
// ==========================================================
export default {
  // Menangani semua permintaan HTTP melalui Hono
  fetch: app.fetch,

  // Mendaftarkan kelas Durable Object ke runtime Cloudflare.
  // Nama properti `WebSocketDO` harus sama persis dengan `class_name` di wrangler.toml
  WebSocketDO: WebSocketDO,
};