// src/routes/token.js

export const handleTokenClaim = async (c) => {
    const { token } = c.req.param();
    const request = c.req.raw;

    // Jangan proses file aset (seperti favicon.ico) sebagai token
    if (token.includes('.')) {
        return c.env.ASSETS.fetch(request);
    }

    const currentIp = request.headers.get("CF-Connecting-IP") || "unknown";

    try {
        // 1. Cek apakah token ada di database
        const ps = c.env.DB.prepare('SELECT id, user, pass, id_mobil, claimed_by_ip FROM tokens WHERE token = ?');
        const data = await ps.bind(token).first();

        // KASUS 1: TOKEN TIDAK VALID / TIDAK DITEMUKAN
        if (!data) {
            return c.env.ASSETS.fetch(new URL('/invalid.html', request.url));
        }

        // KASUS 2: TOKEN SUDAH DIKLAIM
        if (data.claimed_by_ip) {
            // Cek apakah IP-nya sama (pengguna yang sama me-refresh halaman)
            if (data.claimed_by_ip === currentIp) {
                // IP SAMA: Berikan akses lagi
                return serveSuccessPage(c, data);
            } else {
                // IP BEDA: Token sudah diambil orang lain
                return c.env.ASSETS.fetch(new URL('/taken.html', request.url));
            }
        }

        // KASUS 3: TOKEN VALID TAPI BELUM DIKLAIM (FRESH TOKEN)
        // Lakukan klaim dengan operasi UPDATE yang atomik.
        const claimPs = c.env.DB.prepare(
            'UPDATE tokens SET claimed_by_ip = ?, claimed_at = ? WHERE token = ? AND claimed_by_ip IS NULL'
        );
        const { success, meta } = await claimPs.bind(currentIp, new Date().toISOString(), token).run();

        // Cek apakah update berhasil. Jika `meta.changes` adalah 0, berarti
        // ada proses lain yang mengklaim token ini sepersekian detik lebih dulu (race condition).
        if (success && meta.changes > 0) {
            // Klaim berhasil!
            return serveSuccessPage(c, data);
        } else {
            // Gagal mengklaim (kemungkinan sudah diambil orang lain)
            return c.env.ASSETS.fetch(new URL('/taken.html', request.url));
        }

    } catch (e) {
        console.error("D1 Query Error:", e);
        return c.text('Terjadi kesalahan pada server.', 500);
    }
};

/**
 * Helper untuk menyajikan halaman sukses dengan menyuntikkan kredensial.
 * @param {Context} c - Konteks Hono
 * @param {object} credentials - Objek berisi { id, user, pass, id_mobil }
 */
async function serveSuccessPage(c, credentials) {
    try {
        const asset = await c.env.ASSETS.fetch(new URL('/C.html', c.req.url));
        let html = await asset.text();
        
        // Suntikkan semua data yang diperlukan, termasuk id_mobil
        const injectionData = {
            user: credentials.user,
            pass: credentials.pass,
            id: credentials.id,
            id_mobil: credentials.id_mobil 
        };
        
        const injectionScript = `<script>window.MQTT_CREDENTIALS = ${JSON.stringify(injectionData)};</script>`;
        html = html.replace('</body>', `${injectionScript}</body>`);
        
        const response = new Response(html, asset);
        response.headers.set('Content-Type', 'text/html;charset=UTF-8');
        return response;
    } catch (e) {
        console.error("Error serving success page:", e);
        return c.text('Gagal memuat halaman C.html.', 500);
    }
}