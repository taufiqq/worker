// src/routes/video.js

import { Hono } from 'hono';
import { adminAuth } from '../middleware/adminAuth.js';

const videoRoutes = new Hono();

// --- RUTE HALAMAN STREAMER ---
// Rute ini menggunakan middleware adminAuth dan menyuntikkan kredensial ke HTML.
videoRoutes.get('/video/:id_mobil', adminAuth, async (c) => {
    // Ambil kredensial dari header Basic Auth yang sudah divalidasi oleh middleware
    const authHeader = c.req.header('Authorization');
    const decodedCreds = atob(authHeader.substring(6));
    const [user, pass] = decodedCreds.split(':');

    // Ambil file HTML aset
    const asset = await c.env.ASSETS.fetch(new URL('/streamer.html', c.req.url));
    
    // Siapkan data untuk disuntikkan
    const injectionData = { user, pass };
    const injectionScript = `<script>window.ADMIN_CREDENTIALS = ${JSON.stringify(injectionData)};</script>`;

    // Gunakan HTMLRewriter untuk menyuntikkan skrip
    return new HTMLRewriter()
      .on('body', {
        element: (element) => {
          element.append(injectionScript, { html: true });
        },
      })
      .transform(asset);
});

// --- RUTE "PENJAGA GERBANG" WEBSOCKET ---
// Rute ini mengautentikasi dan meneruskan koneksi ke Durable Object.
videoRoutes.get('/api/video/ws/:id_mobil', async (c) => {
    const id_mobil = c.req.param('id_mobil');
    const token = c.req.query('token');
    const adminUser = c.req.query('user');
    const adminPass = c.req.query('pass');
    
    let role = null;
    let isValid = false;

    // Cek Autentikasi Viewer (berdasarkan token)
    if (token) {
        try {
            const ps = c.env.DB.prepare('SELECT id FROM tokens WHERE token = ? AND id_mobil = ? AND claimed_by_ip IS NOT NULL');
            const data = await ps.bind(token, id_mobil).first();
            if (data) {
                isValid = true;
                role = 'viewer';
            }
        } catch (e) { console.error("Error validasi token viewer:", e); }
    } 
    // Cek Autentikasi Streamer (berdasarkan query user/pass)
    else if (adminUser && adminPass) {
        try {
            const adminData = await c.env.ADMIN.get(`admin:${adminUser}`, 'json');
            if (adminData && adminData.pass === adminPass) {
                isValid = true;
                role = 'streamer';
            }
        } catch(e) { console.error("Error validasi Basic Auth streamer:", e); }
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

export default videoRoutes;