// src/index.js

import { Hono } from 'hono';

const app = new Hono();

// Handler untuk rute API tetap sama
app.get('/api/*', (c) => {
  return c.json({
    name: 'Cloudflare',
    framework: 'Hono',
    message: 'This is a response from an API route!',
  });
});

/**
 * Definisikan handler untuk HTMLRewriter.
 * Kelas ini akan menambahkan sebuah elemen ke akhir <body>.
 */
class ElementInjector {
  // Metode `element` akan dipanggil untuk setiap elemen yang cocok dengan selector.
  element(element) {
    const visitorIp = element.getAttribute('data-visitor-ip'); // Mengambil atribut dari element target
    const injectedHtml = `
      <div style="background-color: #f0f8ff; border: 1px solid #b0c4de; padding: 15px; margin-top: 20px; border-radius: 5px;">
        <h2>✨ Content Injected by Cloudflare Worker!</h2>
        <p>This section was added dynamically using HTMLRewriter.</p>
        <p>Your IP address is: <strong>${visitorIp}</strong></p>
      </div>
    `;
    
    // Menyisipkan HTML di akhir elemen body
    element.append(injectedHtml, { html: true });
  }
}

// Handler notFound sekarang menjadi async karena kita perlu 'await' fetch
app.notFound(async (c) => {
  // 1. Ambil aset statis seperti biasa
  const assetResponse = await c.env.ASSETS.fetch(c.req.raw);

  // 2. Periksa apakah itu file HTML. Kita hanya ingin memodifikasi HTML.
  const contentType = assetResponse.headers.get('Content-Type');
  if (contentType && contentType.toLowerCase().includes('text/html')) {
    
    // 3. Jika itu HTML, buat instance HTMLRewriter
    const rewriter = new HTMLRewriter();

    // Dapatkan IP pengunjung dari header
    const visitorIp = c.req.header('CF-Connecting-IP') || 'Not available';

    // 4. Ubah respons dengan menambahkan handler kita
    //    - '.on('body', ...)' menargetkan elemen <body>
    //    - 'new ElementInjector()' adalah handler yang akan melakukan perubahan
    //    - '.transform(assetResponse)' menerapkan transformasi ke stream respons
    return rewriter
      .on('body', {
        element: (el) => {
            // Kita bisa menambahkan data dinamis sebagai atribut
            // sebelum handler kita dieksekusi.
            el.setAttribute('data-visitor-ip', visitorIp);
        }
      })
      .on('body', new ElementInjector())
      .transform(assetResponse);
  }

  // 5. Jika bukan HTML (misalnya CSS, JS, gambar), kembalikan aset apa adanya.
  return assetResponse;
});

export default app;