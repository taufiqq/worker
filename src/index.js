// File: src/index.js (PERBAIKAN FINAL UNTUK STATIC ASSETS)

// --- PERUBAHAN DI SINI ---
// Kita ganti import 'serveStatic' dari 'hono/cloudflare-workers'
// menjadi 'hono/cloudflare-pages' yang tahu cara menangani [site]
import { Hono } from 'hono'
import { serveStatic } from 'hono/cloudflare-pages' // <--- INI PERUBAHANNYA

// Fungsi helper untuk menampilkan halaman error (tidak berubah)
function showErrorPage(c, error) {
    const errorHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Worker Error</title>
          <style> body { font-family: sans-serif; background-color: #282c34; color: #abb2bf; padding: 20px; } .container { background-color: #323842; padding: 25px; border-radius: 8px; border: 1px solid #4b5263; } h1 { color: #e06c75; border-bottom: 2px solid #e06c75; padding-bottom: 10px; } h2 { color: #98c379; } pre { background-color: #21252b; padding: 15px; border-radius: 5px; white-space: pre-wrap; word-wrap: break-word; color: #c8ceda; } </style>
      </head>
      <body>
          <div class="container"><h1>Internal Server Error (500)</h1><p>Terjadi kesalahan saat memproses permintaan Anda. Ini bukan salah Anda.</p><h2>Pesan Error:</h2><pre>${error.message}</pre><h2>Stack Trace (Detail Teknis):</h2><pre>${error.stack}</pre></div>
      </body>
      </html>
    `;
    return c.html(errorHtml, 500);
}

// Durable Object Class (tidak berubah)
export class TokenLocker {
  constructor(state, env) { this.state = state; }
  async fetch(request) {
    const ipAddress = request.headers.get('CF-Connecting-IP') || 'unknown';
    const holderIp = await this.state.storage.get('holderIp');
    if (holderIp) {
      if (holderIp === ipAddress) { return new Response("OK", { status: 200 }); } 
      else { return new Response("Token ini sudah digunakan oleh IP lain.", { status: 403 }); }
    } else {
      await this.state.storage.put('holderIp', ipAddress);
      return new Response("OK", { status: 200 });
    }
  }
}

// Aplikasi Hono (tidak berubah)
const app = new Hono()

app.onError((err, c) => {
  console.error(`[Hono] Uncaught Error: ${err}`);
  return showErrorPage(c, err);
});

// Sajikan aset statis - sekarang menggunakan middleware yang benar
app.use('/*', serveStatic()) // Tidak perlu `root` lagi, karena middleware ini tahu dari [site]

// Route utama (tidak berubah)
app.get('/:token', async (c) => {
  const { token } = c.req.param()
  
  if (!c.env.TOKEN_DB) throw new Error("Binding Error: KV Namespace 'TOKEN_DB' tidak terkonfigurasi.");
  if (!c.env.TOKEN_LOCKER) throw new Error("Binding Error: Durable Object 'TOKEN_LOCKER' tidak terkonfigurasi.");
  
  const credentialsRaw = await c.env.TOKEN_DB.get(token);
  if (!credentialsRaw) return c.text(`Token "${token}" tidak valid atau tidak ditemukan.`, 404);
  
  let credentials;
  try {
      credentials = JSON.parse(credentialsRaw);
  } catch (e) {
      throw new Error(`Data Corruption: Gagal mem-parsing JSON dari KV untuk token "${token}". Isi data: '${credentialsRaw}'`);
  }
  
  const id = c.env.TOKEN_LOCKER.idFromName(token);
  const obj = c.env.TOKEN_LOCKER.get(id);
  const lockResponse = await obj.fetch(c.req.raw);

  if (!lockResponse.ok) {
    const errorMessage = await lockResponse.text();
    return c.html(`<h1>Akses Ditolak</h1><p>${errorMessage}</p>`, lockResponse.status);
  }

  // Mengambil C.html sekarang harus dilakukan secara manual karena serveStatic
  // tidak akan mengeksekusi route lain jika file ditemukan. Kita pindahkan logika ini
  // ke dalam route yang tidak akan tertangkap oleh serveStatic, yaitu route token ini.
  const cHtmlResponse = await c.env.ASSETS.fetch(new URL('/C.html', c.req.url));
  if (!cHtmlResponse.ok) throw new Error(`Asset Not Found: Gagal mengambil file /C.html dari folder static.`);
  
  let html = await cHtmlResponse.text();
  const injectionScript = `<script>window.MQTT_CREDENTIALS = { user: "${credentials.user}", pass: "${credentials.pass}" }; window.ID = ${credentials.id};</script>`;
  html = html.replace('</body>', `${injectionScript}</body>`);
  
  return c.html(html);
})

// Export (tidak berubah)
export default {
  fetch: app.fetch,
  TokenLocker: TokenLocker, 
}