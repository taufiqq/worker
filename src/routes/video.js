// src/routes/video.js

/**
 * Handler untuk menyajikan halaman streamer video setelah autentikasi.
 * Mengambil token berdasarkan id_mobil dan menyuntikkannya sebagai Session ID.
 */
export const handleVideoStreamPage = async (c) => {
    const { id_mobil } = c.req.param();
    
    try {
        // 1. Cari token di D1 berdasarkan id_mobil dari URL
        const ps = c.env.DB.prepare('SELECT token FROM tokens WHERE id_mobil = ? LIMIT 1');
        const result = await ps.bind(id_mobil).first();

        // 2. Jika tidak ada token untuk id_mobil tersebut, kirim error 404
        if (!result || !result.token) {
            return c.text(`Token untuk ID Mobil ${id_mobil} tidak ditemukan di database.`, 404);
        }

        const token = result.token;

        // 3. Ambil file HTML dari assets
        const asset = await c.env.ASSETS.fetch(new URL('/streamer.html', c.req.url));
        if (!asset.ok) {
            return c.text('File streamer.html tidak ditemukan.', 500);
        }
        let html = await asset.text();

        // 4. Buat script untuk menyuntikkan token sebagai Session ID WebRTC
        const injectionScript = `<script>window.WEBRTC_SESSION_ID = "${token}";</script>`;
        
        // 5. Suntikkan script ke dalam HTML sebelum tag </body>
        html = html.replace('</body>', `${injectionScript}</body>`);
        
        // 6. Sajikan halaman yang sudah dimodifikasi
        const response = new Response(html, asset);
        response.headers.set('Content-Type', 'text/html;charset=UTF-8');
        return response;

    } catch (e) {
        console.error("Error handling video stream page:", e);
        return c.text('Terjadi kesalahan pada server saat memproses permintaan Anda.', 500);
    }
};