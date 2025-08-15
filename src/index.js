// --- START OF FILE src/index.js ---

import { Hono } from 'hono';

// 1. Impor Durable Object Anda
import { VideoSession } from './durable-objects/VideoSession.js';

// 2. Impor semua handler rute Anda
import { adminAuth } from './middleware/adminAuth.js';
import { handleAdminPage } from './routes/admin.js';
import adminApiRoutes from './routes/adminApi.js';
import { handleTokenClaim } from './routes/token.js';


// 3. Inisialisasi dan pendaftaran rute
const app = new Hono();

// --- RUTE BARU UNTUK WEBRTC ---
// Rute untuk menyajikan halaman streamer
app.get('/video/:id_mobil', (c) => {
    return c.env.ASSETS.fetch(new URL('/streamer.html', c.req.url));
});

// Rute untuk menangani koneksi WebSocket ke Durable Object
app.get('/api/video/ws/:id_mobil', (c) => {
    const id_mobil = c.req.param('id_mobil');
    if (!id_mobil) {
        return new Response('id_mobil is required', { status: 400 });
    }

    // Dapatkan ID unik untuk DO berdasarkan id_mobil
    const doId = c.env.VIDEO_SESSIONS.idFromName(id_mobil);
    // Dapatkan stub (objek untuk berinteraksi) dari DO
    const stub = c.env.VIDEO_SESSIONS.get(doId);
    
    // Teruskan permintaan (termasuk header upgrade) ke DO
    return stub.fetch(c.req.raw);
});


// --- RUTE LAMA ANDA (TETAP ADA) ---
app.get('/admin', adminAuth, handleAdminPage);
app.route('/api/admin', adminApiRoutes);
app.get('/:token', handleTokenClaim);

// Rute fallback untuk aset statis (selalu paling akhir)
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw));


// 4. Ekspor utama untuk Cloudflare Worker
export default {
  fetch: app.fetch,
};

// 5. Ekspor juga class Durable Object Anda
export { VideoSession };