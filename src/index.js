// File: src/index.js - HANYA SEBAGAI ROUTER

import { Hono } from 'hono';

// ==========================================================
// 1. IMPOR SEMUA KOMPONEN YANG DIBUTUHKAN
// ==========================================================

// Impor kelas Durable Object (PENTING untuk diekspor kembali)
import { WebSocketDO } from './durable-objects/websocket.do.js';

// Impor handler untuk setiap rute
import { handleWebSocketUpgrade } from './routes/websocket.js'; // <-- Handler dari file Anda
import { adminAuth } from './middleware/adminAuth.js';
import { handleAdminPage } from './routes/admin.js';
import adminApiRoutes from './routes/adminApi.js';
import { handleTokenClaim } from './routes/token.js';
import { handleVideoStreamPage } from './routes/video.js';


// ==========================================================
// 2. INISIALISASI DAN PENDAFTARAN RUTE
// ==========================================================
const app = new Hono();

// Daftarkan setiap rute ke handler-nya masing-masing
app.get('/admin', adminAuth, handleAdminPage);
app.route('/api/admin', adminApiRoutes);
app.get('/video/:id_mobil', adminAuth, handleVideoStreamPage);
app.get('/:token', handleTokenClaim);

// Gunakan handler yang sudah dipisah untuk rute WebSocket
app.get('/ws/:sessionId', handleWebSocketUpgrade);

// Rute fallback untuk aset statis harus di bagian paling akhir
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw));


// ==========================================================
// 3. EKSPOR UTAMA (STRUKTUR INI WAJIB UNTUK DEPLOYMENT)
// ==========================================================
// Meskipun index.js hanya router, ia tetap file utama (entrypoint)
// yang harus memberitahu Cloudflare tentang Durable Object yang ada.
export default {
  // Teruskan semua request ke Hono
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),

  // Ekspor kelas Durable Object agar dikenali oleh runtime
  WebSocketDO: WebSocketDO,
};