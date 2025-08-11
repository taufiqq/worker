import { Hono } from 'hono';

// 1. IMPOR KELAS DO DARI FILE TERPISAH
// Ini adalah langkah "manual" untuk memberitahu index.js tentang DO kita.
import { WebSocketDO } from './durable-objects/websocket.do.js';

// Impor semua handler rute Anda
import { handleWebSocketUpgrade } from './routes/websocket.js';
import { adminAuth } from './middleware/adminAuth.js';
import { handleAdminPage } from './routes/admin.js';
import adminApiRoutes from './routes/adminApi.js';
import { handleTokenClaim } from './routes/token.js';
import { handleVideoStreamPage } from './routes/video.js';

const app = new Hono();

// Daftarkan semua rute
app.get('/admin', adminAuth, handleAdminPage);
app.route('/api/admin', adminApiRoutes);
app.get('/video/:id_mobil', adminAuth, handleVideoStreamPage);
app.get('/ws/:sessionId', handleWebSocketUpgrade);
app.get('/:token', handleTokenClaim);
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw));

// 2. EKSPOR OBJEK SECARA EKSPLISIT (BUKAN HANYA 'app')
// Ini adalah cara "manual" untuk mendaftarkan semuanya ke Cloudflare.
// Ini memberitahu Wrangler: "Gunakan Hono untuk 'fetch', dan ini kelas DO-ku".
export default {
  fetch: app.fetch,
  WebSocketDO: WebSocketDO,
};