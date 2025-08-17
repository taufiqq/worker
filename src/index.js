// --- START OF FILE src/index.js ---

import { Hono } from 'hono';

// 1. Impor Durable Object
import { VideoSession } from './durable-objects/VideoSession.js';
import { CarSession } from './durable-objects/CarSession.js'; // <-- TAMBAHKAN INI

// 2. Impor semua handler/router
import { adminAuth } from './middleware/adminAuth.js';
import { handleAdminPage } from './routes/admin.js';
import adminApiRoutes from './routes/adminApi.js';
import { handleTokenClaim } from './routes/token.js';
import videoRoutes from './routes/video.js';
import mqttRoutes from './routes/mqtt.js'; // <-- TAMBAHKAN INI

// 3. Inisialisasi Hono
const app = new Hono();

// 4. Daftarkan semua router ke aplikasi utama
app.route('/mqtt', mqttRoutes);         // <-- TAMBAHKAN INI: Rute untuk wss://.../mqtt/
app.route('/', videoRoutes);           // Rute untuk /video/... dan /api/video/ws/...
app.route('/api/admin', adminApiRoutes); // Rute untuk /api/admin/...

// 5. Daftarkan rute individual
app.get('/admin', adminAuth, handleAdminPage);
app.get('/:token', handleTokenClaim);

// 6. Rute fallback untuk aset statis (selalu paling akhir)
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw));

// 7. Ekspor utama untuk Cloudflare Worker
export default {
  fetch: app.fetch,
};

// 8. Ekspor juga class Durable Object
export { VideoSession, CarSession }; // <-- TAMBAHKAN CarSession DI SINI