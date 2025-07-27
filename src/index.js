// File: src/index.js (VERSI JAVASCRIPT MURNI - PASTI BERHASIL)

import { Hono } from 'hono'
import { serveStatic } from 'hono/cloudflare-workers'

// =================================================================
//  BAGIAN 1: DURABLE OBJECT CLASS - 'TokenLocker'
//  Kode ini tidak berubah dan sudah benar.
// =================================================================
export class TokenLocker {
  constructor(state, env) {
    this.state = state;
  }

  async fetch(request) {
    const ipAddress = request.headers.get('CF-Connecting-IP');
    const holderIp = await this.state.storage.get('holderIp');

    if (holderIp) {
      if (holderIp === ipAddress) {
        return new Response("OK", { status: 200 });
      } else {
        return new Response("Token ini sudah digunakan oleh IP lain.", { status: 403 });
      }
    } else {
      await this.state.storage.put('holderIp', ipAddress);
      return new Response("OK", { status: 200 });
    }
  }
}

// =================================================================
//  BAGIAN 2: APLIKASI HONO - Router Utama
// =================================================================

// --- INI PERBAIKANNYA ---
// Inisialisasi Hono untuk JavaScript murni, tanpa sintaks 'type'.
const app = new Hono()

// --- ROUTE 1: Menyajikan aset statis (style.css dan script.js) ---
// Middleware untuk menyajikan file dari folder /static.
// Hono akan otomatis mencari file yang cocok dengan path request.
// Contoh: request ke /style.css akan menyajikan /static/style.css
app.use('/*', serveStatic({ root: './' }))

// --- ROUTE 2: Menangani permintaan token dinamis ---
// Ini adalah route utama yang akan menangkap URL seperti /token-abc
app.get('/:token', async (c) => {
  const { token } = c.req.param()
  
  // 1. Cek apakah token ada di database KV kita
  // c.env memberikan akses ke bindings di wrangler.toml (KV, DO, dll)
  const credentials = await c.env.TOKEN_DB.get(token, { type: 'json' });
  if (!credentials) {
    return c.text('Token tidak valid atau tidak ditemukan.', 404);
  }

  // 2. Panggil Durable Object untuk mencoba mengunci token
  // Dapatkan ID yang konsisten untuk DO berdasarkan nama token
  const id = c.env.TOKEN_LOCKER.idFromName(token);
  // Dapatkan referensi (stub) ke instance DO
  const obj = c.env.TOKEN_LOCKER.get(id);
  
  // Teruskan request ke DO. c.req.raw adalah objek Request asli.
  const lockResponse = await obj.fetch(c.req.raw);

  // 3. Periksa hasil dari DO
  if (!lockResponse.ok) {
    // Jika DO menolak akses (misal: status 403), teruskan pesan errornya ke user.
    const errorMessage = await lockResponse.text();
    return c.html(`<h1>Akses Ditolak</h1><p>${errorMessage}</p>`, lockResponse.status);
  }

  // 4. Jika penguncian berhasil, sajikan C.html dengan data yang disuntikkan
  try {
    // Ambil konten C.html dari aset statis yang sudah dibundle oleh Wrangler
    // c.env.ASSETS adalah cara Hono/Wrangler mengakses file dari folder `site.bucket`
    const cHtmlResponse = await c.env.ASSETS.fetch(new URL('/C.html', c.req.url));
    if (!cHtmlResponse.ok) {
        return c.text("Gagal memuat file halaman utama.", 500);
    }
    let html = await cHtmlResponse.text();
    
    // Siapkan skrip untuk menyuntikkan kredensial MQTT
    const injectionScript = `
      <script>
        window.MQTT_CREDENTIALS = {
          user: "${credentials.user}",
          pass: "${credentials.pass}"
        };
        window.ID = ${credentials.id};
      </script>
    `;
    
    // Suntikkan skrip sebelum tag penutup </body>
    html = html.replace('</body>', `${injectionScript}</body>`);
    
    // Kirim HTML yang sudah dimodifikasi ke browser
    return c.html(html);

  } catch (e) {
    console.error("Error saat memuat atau memodifikasi C.html:", e);
    return c.text("Terjadi kesalahan internal saat menyiapkan halaman.", 500);
  }
})

// Export aplikasi Hono sebagai handler default Worker
export default {
  fetch: app.fetch,
  // Kita juga perlu mengekspor class Durable Object agar Cloudflare bisa menemukannya
  // Ini adalah bagian yang sangat penting!
  TokenLocker: TokenLocker, 
}