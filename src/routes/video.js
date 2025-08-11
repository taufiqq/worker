// src/routes/video.js

/**
 * Handler untuk menyajikan halaman streamer video setelah autentikasi.
 * Membuat secret untuk streamer, menyimpannya di DO, dan menyuntikkannya ke halaman.
 */
export const handleVideoStreamPage = async (c) => {
    const { id_mobil } = c.req.param();

    try {
        // 1. Verifikasi id_mobil ada di DB (praktik yang baik)
        const ps = c.env.DB.prepare('SELECT token FROM tokens WHERE id_mobil = ? LIMIT 1');
        const result = await ps.bind(id_mobil).first();
        if (!result) {
            return c.text(`ID Mobil ${id_mobil} tidak ditemukan di database.`, 404);
        }

        // 2. Buat secret unik untuk sesi streaming ini
        const streamSecret = crypto.randomUUID();

        // 3. Dapatkan stub DO dan kirim secret untuk disimpan
        const doId = c.env.WEBSOCKET_DO.idFromName(id_mobil);
        const doStub = c.env.WEBSOCKET_DO.get(doId);
        
        // Kirim permintaan HTTP (bukan WebSocket) ke DO untuk mengatur secret
        // Kita menggunakan URL internal fiktif yang akan dikenali oleh DO
        await doStub.fetch('https://webrtc.internal/_set_stream_secret', {
            method: 'POST',
            body: streamSecret,
        });

        // 4. Ambil file HTML dari assets
        const asset = await c.env.ASSETS.fetch(new URL('/streamer.html', c.req.url));
        if (!asset.ok) {
            return c.text('File streamer.html tidak ditemukan.', 500);
        }
        let html = await asset.text();

        // 5. Suntikkan id_mobil (sebagai sessionId) DAN streamSecret
        const injectionScript = `<script>
            window.WEBRTC_SESSION_ID = "${id_mobil}";
            window.WEBRTC_STREAM_SECRET = "${streamSecret}";
        </script>`;
        
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