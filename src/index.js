// src/index.js

import { Hono } from 'hono';

/**
 * ====================================================================
 *  Definisi Kelas Durable Object (ClaimLockDO)
 * ====================================================================
 * Setiap instance DO ini mewakili satu token dan status klaimnya.
 */
export class ClaimLockDO {
  constructor(state) {
    this.state = state;
  }

  // API untuk DO ini. Cukup periksa dan set status "claimed".
  async fetch() {
    // Periksa apakah token ini sudah pernah diklaim
    const isClaimed = await this.state.storage.get("claimed");

    if (isClaimed) {
      // Jika ya, kembalikan status "taken"
      return new Response("taken");
    } else {
      // Jika tidak, ini adalah klaim pertama.
      // Set status menjadi 'true' dan simpan. Ini adalah operasi atomik.
      await this.state.storage.put("claimed", true);
      // Kembalikan status "success"
      return new Response("success");
    }
  }
}

/**
 * ====================================================================
 *  Aplikasi Hono (Titik Masuk Worker)
 * ====================================================================
 */
const app = new Hono();

// Rute ini akan menangkap semua permintaan seperti /token123, /apapun, dll.
app.get('/:token', async (c) => {
  const { token } = c.req.param();
  const request = c.req.raw;

  // --- Langkah 1: Cek Status Klaim dengan Durable Object ---
  // Dapatkan ID DO yang unik dan konsisten berdasarkan nama token
  const doId = c.env.CLAIM_LOCK_DO.idFromName(token);
  const stub = c.env.CLAIM_LOCK_DO.get(doId);
  
  // Hubungi DO untuk mencoba mengklaim token ini
  const doResponse = await stub.fetch(request);
  const claimStatus = await doResponse.text(); // Akan berisi "success" atau "taken"

  if (claimStatus === 'taken') {
    // Jika token sudah diklaim, sajikan halaman 'taken.html' dan hentikan proses.
    return c.env.ASSETS.fetch(new URL('/taken.html', request.url));
  }

  // --- Langkah 2: Jika Klaim Berhasil, Cek Kredensial di KV ---
  // Kode ini hanya berjalan jika claimStatus adalah "success"
  const credentials = await c.env.TOKEN.get(token, { type: 'json' });

  if (!credentials) {
    // Jika token tidak ada di KV, sajikan halaman 'invalid.html'
    return c.env.ASSETS.fetch(new URL('/invalid.html', request.url));
  }

  // --- Langkah 3: Jika Kredensial Valid, Sajikan dan Suntikkan C.html ---
  try {
    const asset = await c.env.ASSETS.fetch(new URL('/C.html', request.url));
    let html = await asset.text();

    const injectionScript = `
    <script>
        window.MQTT_CREDENTIALS = ${JSON.stringify({ user: credentials.user, pass: credentials.pass })};
        window.ID = ${JSON.stringify(credentials.id)};
    </script>
    `;

    html = html.replace('</body>', `${injectionScript}</body>`);

    const response = new Response(html, asset);
    // Pastikan header Content-Type di-set dengan benar
    response.headers.set('Content-Type', 'text/html;charset=UTF-8');
    
    return response;

  } catch (e) {
    return c.text('Gagal memuat halaman C.html.', 500);
  }
});

// Fallback untuk menyajikan file statis lainnya (seperti CSS/JS yang dipanggil dari C.html)
// atau halaman root.
app.get('*', (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});


// Ekspor worker dan kelas Durable Object
export default {
  fetch: app.fetch,
  ClaimLockDO: ClaimLockDO,
};