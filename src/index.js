// File: src/index.js (DENGAN PERBAIKAN PADA EXPORT)

import { Hono } from 'hono'
import { serveStatic } from 'hono/cloudflare-workers'

// =================================================================
//  BAGIAN 1: DURABLE OBJECT CLASS - 'TokenLocker'
//  Kita harus mengekspor class ini secara langsung agar Wrangler bisa menemukannya.
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
//  Kode di bagian ini tidak berubah.
// =================================================================

const app = new Hono()

app.use('/*', serveStatic({ root: './' }))

app.get('/:token', async (c) => {
  const { token } = c.req.param()
  
  const credentials = await c.env.TOKEN_DB.get(token, { type: 'json' });
  if (!credentials) {
    return c.text('Token tidak valid atau tidak ditemukan.', 404);
  }

  const id = c.env.TOKEN_LOCKER.idFromName(token);
  const obj = c.env.TOKEN_LOCKER.get(id);
  
  const lockResponse = await obj.fetch(c.req.raw);

  if (!lockResponse.ok) {
    const errorMessage = await lockResponse.text();
    return c.html(`<h1>Akses Ditolak</h1><p>${errorMessage}</p>`, lockResponse.status);
  }

  try {
    const cHtmlResponse = await c.env.ASSETS.fetch(new URL('/C.html', c.req.url));
    if (!cHtmlResponse.ok) {
        return c.text("Gagal memuat file halaman utama.", 500);
    }
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

  } catch (e) {
    console.error("Error saat memuat atau memodifikasi C.html:", e);
    return c.text("Terjadi kesalahan internal saat menyiapkan halaman.", 500);
  }
})

// =================================================================
//  BAGIAN 3: EXPORT - INI PERUBAHAN UTAMANYA
// =================================================================

// Daripada menggabungkan semuanya, kita ekspor aplikasi Hono sebagai handler default.
// Class TokenLocker sudah diekspor secara individual di atas dengan kata kunci 'export'.
export default app