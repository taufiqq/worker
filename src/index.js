// File: src/index.js

import { Hono } from 'hono'
import { serveStatic } from 'hono/cloudflare-workers'

// =================================================================
//  BAGIAN 1: DURABLE OBJECT CLASS - 'TokenLocker'
//  Ini adalah otak dari sistem "siapa cepat dia dapat".
// =================================================================
export class TokenLocker {
  constructor(state, env) {
    this.state = state; // Menggunakan storage internal yang konsisten (SQLite-backed)
  }

  // Metode ini akan dieksekusi setiap kali ada request ke instance DO ini.
  async fetch(request) {
    const ipAddress = request.headers.get('CF-Connecting-IP');
    const holderIp = await this.state.storage.get('holderIp');

    if (holderIp) {
      // KASUS 1: Token sudah ada yang memiliki.
      if (holderIp === ipAddress) {
        return new Response("OK", { status: 200 }); // Izin diberikan kembali
      } else {
        return new Response("Token ini sudah digunakan oleh IP lain.", { status: 403 }); // Tolak
      }
    } else {
      // KASUS 2: Token belum ada pemiliknya. Ini pemenangnya!
      await this.state.storage.put('holderIp', ipAddress);
      return new Response("OK", { status: 200 }); // Izin diberikan
    }
  }
}

// =================================================================
//  BAGIAN 2: APLIKASI HONO - Router Utama
// =================================================================

// Mendefinisikan tipe binding untuk autocompletion (opsional tapi bagus)
type Bindings = {
  TOKEN_LOCKER: DurableObjectNamespace
  TOKEN_DB: KVNamespace
}

const app = new Hono<{ Bindings: Bindings }>()

// --- ROUTE 1: Menyajikan aset statis (style.css dan script.js) ---
// Semua request yang tidak cocok dengan route lain akan mencoba mencari file di folder /static
app.use('/*', serveStatic({ root: './' }))

// --- ROUTE 2: Menangani permintaan token dinamis ---
app.get('/:token', async (c) => {
  const { token } = c.req.param()
  
  // 1. Cek apakah token ada di database KV kita
  const credentials = await c.env.TOKEN_DB.get(token, { type: 'json' });
  if (!credentials) {
    return c.text('Token tidak valid atau tidak ditemukan.', 404);
  }

  // 2. Panggil Durable Object untuk mencoba mengunci token
  const id = c.env.TOKEN_LOCKER.idFromName(token);
  const obj = c.env.TOKEN_LOCKER.get(id);
  
  // Teruskan request ke DO. Header akan otomatis diteruskan.
  const lockResponse = await obj.fetch(c.req.raw);

  // 3. Periksa hasil dari DO
  if (!lockResponse.ok) {
    // Jika DO menolak akses (status 403), teruskan pesan errornya ke user.
    const errorMessage = await lockResponse.text();
    return c.html(`<h1>Akses Ditolak</h1><p>${errorMessage}</p>`, lockResponse.status);
  }

  // 4. Jika penguncian berhasil, sajikan C.html dengan data yang disuntikkan
  // Kita ambil konten C.html dari aset statis yang sudah dibundle.
  const cHtmlResponse = await c.env.ASSETS.fetch(new URL('/C.html', c.req.url));
  let html = await cHtmlResponse.text();
  
  const injectionScript = `
    <script>
      window.MQTT_CREDENTIALS = {
        user: "${credentials.user}",
        pass: "${credentials.pass}"
      };
      window.ID = ${credentials.id};
    </script>
  `;
  
  html = html.replace('</body>', `${injectionScript}</body>`);
  
  return c.html(html);
})

export default app