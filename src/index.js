// --- START OF FILE src/index.js ---

import { Hono } from 'hono';
import { VideoSession } from './durable-objects/VideoSession.js';
import { adminAuth } from './middleware/adminAuth.js'; // Pastikan adminAuth diimpor
import { handleAdminPage } from './routes/admin.js';
import adminApiRoutes from './routes/adminApi.js';
import { handleTokenClaim } from './routes/token.js';

const app = new Hono();

// --- RUTE WEBRTC DENGAN AUTENTIKASI ---

// 1. Proteksi halaman streamer dengan Basic Auth
app.get('/video/:id_mobil', adminAuth, (c) => {
    return c.env.ASSETS.fetch(new URL('/streamer.html', c.req.url));
});

// 2. Rute "Penjaga Gerbang" WebSocket yang cerdas
app.get('/api/video/ws/:id_mobil', async (c) => {
    const id_mobil = c.req.param('id_mobil');
    const token = c.req.query('token');
    const authHeader = c.req.header('Authorization');
    
    let role = null;
    let isValid = false;

    // --- Cek Autentikasi Viewer (berdasarkan token) ---
    if (token) {
        try {
            const ps = c.env.DB.prepare('SELECT id FROM tokens WHERE token = ? AND id_mobil = ? AND claimed_by_ip IS NOT NULL');
            const data = await ps.bind(token, id_mobil).first();
            if (data) {
                isValid = true;
                role = 'viewer';
            }
        } catch (e) {
            console.error("Error validasi token viewer:", e);
        }
    } 
    // --- Cek Autentikasi Streamer (berdasarkan Basic Auth) ---
    else if (authHeader && authHeader.startsWith('Basic ')) {
        try {
            const decodedCreds = atob(authHeader.substring(6));
            const [user, pass] = decodedCreds.split(':');
            const adminData = await c.env.ADMIN.get(`admin:${user}`, 'json');

            if (adminData && adminData.pass === pass) {
                isValid = true;
                role = 'streamer';
            }
        } catch(e) {
             console.error("Error validasi Basic Auth streamer:", e);
        }
    }

    // Jika autentikasi gagal, tolak koneksi
    if (!isValid) {
        return new Response('Autentikasi WebSocket gagal.', { status: 401 });
    }

    // Jika berhasil, teruskan ke Durable Object dengan peran yang sudah ditentukan
    const doId = c.env.VIDEO_SESSIONS.idFromName(id_mobil);
    const stub = c.env.VIDEO_SESSIONS.get(doId);
    
    // Buat request baru untuk menambahkan header kustom
    const forwardReq = new Request(c.req.raw);
    forwardReq.headers.set('X-Client-Role', role);
    
    return stub.fetch(forwardReq);
});


// --- RUTE LAMA ANDA ---
app.get('/admin', adminAuth, handleAdminPage);
app.route('/api/admin', adminApiApiRoutes);
app.get('/:token', handleTokenClaim);
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,
};

export { VideoSession };