// src/routes/video.js

import { Hono } from 'hono';
import { adminAuth } from '../middleware/adminAuth.js';

const videoRoutes = new Hono();

// --- RUTE HALAMAN STREAMER ---
// Rute ini tidak perlu diubah. Ia sudah berfungsi dengan baik untuk menyajikan
// halaman dan menyuntikkan kredensial yang akan kita gunakan.
videoRoutes.get('/video/:id_mobil', adminAuth, async (c) => {
    const authHeader = c.req.header('Authorization');
    const decodedCreds = atob(authHeader.substring(6));
    const [user, pass] = decodedCreds.split(':');

    const asset = await c.env.ASSETS.fetch(new URL('/streamer.html', c.req.url));
    
    const injectionData = { user, pass };
    // Kita akan suntikkan token base64-nya langsung untuk mempermudah.
    injectionData.basicToken = btoa(`${user}:${pass}`);
    const injectionScript = `<script>window.ADMIN_CREDENTIALS = ${JSON.stringify(injectionData)};</script>`;

    return new HTMLRewriter()
      .on('body', {
        element: (element) => {
          element.append(injectionScript, { html: true });
        },
      })
      .transform(asset);
});

// --- RUTE "PENJAGA GERBANG" WEBSOCKET (DIPERBARUI) ---
videoRoutes.get('/api/video/ws/:id_mobil', async (c) => {
    const id_mobil = c.req.param('id_mobil');
    const viewerToken = c.req.query('token');
    const authToken = c.req.query('auth'); // Parameter baru: 'auth'
    
    let role = null;
    let isValid = false;

    // Cek Autentikasi Viewer (berdasarkan token)
    if (viewerToken) {
        try {
            const ps = c.env.DB.prepare('SELECT id FROM tokens WHERE token = ? AND id_mobil = ? AND claimed_by_ip IS NOT NULL');
            const data = await ps.bind(viewerToken, id_mobil).first();
            if (data) {
                isValid = true;
                role = 'viewer';
            }
        } catch (e) { console.error("Error validasi token viewer:", e); }
    } 
    // Cek Autentikasi Streamer (berdasarkan query 'auth')
    else if (authToken) {
        try {
            // Logika ini meniru middleware adminAuth
            const decodedCreds = atob(authToken);
            const [user, pass] = decodedCreds.split(':');
            const adminData = await c.env.ADMIN.get(`admin:${user}`, 'json');
            
            if (adminData && adminData.pass === pass) {
                isValid = true;
                role = 'streamer';
            }
        } catch(e) { console.error("Error validasi Basic Auth streamer via query:", e); }
    }

    // Jika autentikasi gagal, tolak koneksi
    if (!isValid) {
        return new Response('Autentikasi WebSocket gagal.', { status: 401 });
    }

    // Jika berhasil, teruskan ke Durable Object
    const doId = c.env.VIDEO_SESSIONS.idFromName(id_mobil);
    const stub = c.env.VIDEO_SESSIONS.get(doId);
    
    const forwardReq = new Request(c.req.raw);
    forwardReq.headers.set('X-Client-Role', role);
    
    return stub.fetch(forwardReq);
});

export default videoRoutes;