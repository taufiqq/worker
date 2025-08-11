// File: src/index.js

import { Hono } from 'hono';

// IMPOR KELAS DURABLE OBJECT (SANGAT PENTING!)
import { WebSocketDO } from './durable-objects/websocket.do.js';

// IMPOR SEMUA HANDLER RUTE
import { adminAuth } from './middleware/adminAuth.js';
import { handleAdminPage } from './routes/admin.js';
import adminApiRoutes from './routes/adminApi.js';
import { handleTokenClaim } from './routes/token.js';
import { handleVideoStreamPage } from './routes/video.js';
import { handleWebSocketUpgrade } from './routes/websocket.js'; // <- IMPOR HANDLER BARU

// Inisialisasi aplikasi Hono
const app = new Hono();

// ==========================================================
// DEFINISI RUTE (SEKARANG LEBIH RAPI)
// ==========================================================

// Rute Admin Panel
app.get('/admin', adminAuth, handleAdminPage);

// Rute Admin API
app.route('/api/admin', adminApiRoutes);

// Rute untuk menyajikan halaman streamer
app.get('/video/:id_mobil', adminAuth, handleVideoStreamPage);

// RUTE WEBSOCKET: Menggunakan handler yang sudah diimpor
app.get('/ws/:sessionId', handleWebSocketUpgrade);

// Rute untuk klaim token oleh pengguna
app.get('/:token', handleTokenClaim);

// Rute Fallback untuk aset statis (CSS, JS klien, gambar, dll)
app.get('*', (c) => {
    return c.env.ASSETS.fetch(c.req.raw);
});

// ==========================================================
// EKSPOR UTAMA (PALING PENTING DAN SUDAH DIPERBAIKI)
// ==========================================================

export default {
  /**
   * Handler fetch utama untuk semua permintaan HTTP.
   * Kita membungkus app.fetch dalam fungsi eksplisit agar struktur ekspor jelas.
   * @param {Request} request
   * @param {Env} env
   * @param {ExecutionContext} ctx
   * @returns {Promise<Response>}
   */
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),

  /**
   * Ekspor kelas Durable Object.
   * Nama properti ini (`WebSocketDO`) HARUS SAMA PERSIS dengan `class_name`
   * yang Anda definisikan di file `wrangler.toml`. Ini memberitahu runtime Cloudflare
   * kelas mana yang harus digunakan saat membuat instance DO.
   */
  WebSocketDO: WebSocketDO,
};