// src/index.js

import { Hono } from 'hono';

const app = new Hono();

// Definisikan handler untuk HTMLRewriter
// Kelas ini akan menyuntikkan konten ke dalam elemen dengan id="injection-point"
class ContentInjector {
  constructor(dynamicData) {
    this.data = dynamicData;
  }

  element(element) {
    const injectedHtml = `
      <div class="injected">
        <h2>✨ Konten Dinamis Berhasil Disuntikkan!</h2>
        <p>Pesan ini dibuat secara on-the-fly oleh Worker.</p>
        <p>Waktu Server: <strong>${this.data.timestamp}</strong></p>
        <p>Lokasi Pengunjung (Colo): <strong>${this.data.colo}</strong></p>
      </div>
    `;
    element.setInnerContent(injectedHtml, { html: true });
  }
}

// Rute utama untuk menangani permintaan ke "/"
app.get('/', async (c) => {
  // 1. Buat URL absolut ke file a.html yang ada di dalam aset statis.
  //    Penting: fetch() di dalam worker memerlukan URL lengkap atau objek Request.
  const assetUrl = new URL(c.req.url);
  assetUrl.pathname = '/a.html'; // Tunjuk ke file yang kita inginkan

  // 2. Ambil file a.html dari binding ASSETS
  const assetResponse = await c.env.ASSETS.fetch(assetUrl.toString());

  // Pastikan file berhasil diambil sebelum melanjutkan
  if (!assetResponse.ok) {
    return c.text('Error: a.html tidak dapat ditemukan di aset.', 500);
  }

  // 3. Kumpulkan data dinamis yang ingin disuntikkan
  const dynamicData = {
    timestamp: new Date().toUTCString(),
    colo: c.req.cf?.colo || 'N/A', // Ambil kode bandara dari Cloudflare
  };
  
  // 4. Buat instance HTMLRewriter dan terapkan transformasi
  const rewriter = new HTMLRewriter();
  
  return rewriter
    // Targetkan elemen <div id="injection-point">...</div>
    .on('#injection-point', new ContentInjector(dynamicData))
    // Terapkan transformasi pada stream respons dari a.html
    .transform(assetResponse);
});

// Rute API sebagai contoh lain
app.get('/api/status', (c) => {
  return c.json({ status: 'ok' });
});

// Fallback: Untuk permintaan lain yang tidak cocok (misalnya, /favicon.ico), 
// biarkan handler aset statis default yang menanganinya.
app.notFound((c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;