// src/routes/video.js (PERBAIKAN)
export const handleVideoStreamPage = async (c) => {
    // Gunakan cara ini yang lebih eksplisit dan aman
    const id_mobil = c.req.param('id_mobil');

    // TAMBAHKAN VALIDASI PENTING INI
    if (!id_mobil) {
        return c.text('Parameter id_mobil tidak ditemukan di URL.', 400);
    }
    
    try {
        // ... (sisa kode Anda tetap sama)
        const ps = c.env.DB.prepare('SELECT token FROM tokens WHERE id_mobil = ? LIMIT 1');
        const result = await ps.bind(id_mobil).first();
        if (!result) {
            return c.text(`ID Mobil ${id_mobil} tidak ditemukan di database.`, 404);
        }
        
        // Sekarang dijamin `id_mobil` tidak undefined
        const streamSecret = crypto.randomUUID();
        const doId = c.env.WEBSOCKET_DO.idFromName(id_mobil);
        const doStub = c.env.WEBSOCKET_DO.get(doId);

        await doStub.fetch('https://webrtc.internal/_set_stream_secret', {
            method: 'POST',
            body: streamSecret,
        });

        // ... (sisa kode untuk menyuntikkan ke HTML)
        const asset = await c.env.ASSETS.fetch(new URL('/streamer.html', c.req.url));
        if (!asset.ok) {
            return c.text('File streamer.html tidak ditemukan.', 500);
        }
        let html = await asset.text();

        const injectionScript = `<script>
            window.WEBRTC_STREAM_SECRET = "${streamSecret}";
        </script>`;
        
        html = html.replace('</body>', `${injectionScript}</body>`);
        
        const response = new Response(html, asset);
        response.headers.set('Content-Type', 'text/html;charset=UTF-8');
        return response;

    } catch (e) {
        console.error("Error handling video stream page:", e);
        return c.text('Terjadi kesalahan pada server saat memproses permintaan Anda.', 500);
    }
};