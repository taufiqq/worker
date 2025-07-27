// File: src/index.js (FINAL, FINAL VERSION)

import { Hono } from 'hono'
import { NotFoundError } from 'hono/utils/http-exception'

// Durable Object Class (tidak ada perubahan sama sekali)
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

const app = new Hono()

// Middleware untuk menangani error dengan rapi
app.onError((err, c) => {
    console.error('Unhandled exception:', err);
    if (err instanceof NotFoundError) {
        // Jika Hono tidak menemukan route, biarkan Cloudflare mencoba mencari file statis.
        // Ini adalah fallback ke sistem [site].
        return c.env.ASSETS.fetch(c.req.raw);
    }
    return c.text('Internal Server Error', 500);
});

// Hanya definisikan route dinamis yang kita butuhkan.
app.get('/:token', async (c) => {
  const { token } = c.req.param()
  
  // Regex untuk membedakan token dari nama file statis
  const isStaticFileRequest = /\.(css|js|ico|png|jpg|svg)$/.test(token);
  if (isStaticFileRequest) {
    // Jika ini request file statis, lempar NotFoundError agar onError bisa menanganinya
    throw new NotFoundError();
  }

  // Cek & Ambil Kredensial dari KV
  const credentials = await c.env.TOKEN_DB.get(token, { type: 'json' });
  if (!credentials) {
    // Jika token tidak ada di KV, mungkin ini juga request file statis (seperti C.html)
    // atau memang token tidak valid. Kita biarkan fallback yang menanganinya.
    throw new NotFoundError();
  }

  // Panggil Durable Object untuk mengunci token
  const id = c.env.TOKEN_LOCKER.idFromName(token);
  const obj = c.env.TOKEN_LOCKER.get(id);
  const lockResponse = await obj.fetch(c.req.raw);

  if (!lockResponse.ok) {
    const errorMessage = await lockResponse.text();
    return c.html(`<h1>Akses Ditolak</h1><p>${errorMessage}</p>`, lockResponse.status);
  }

  // Ambil C.html dari aset
  const cHtmlResponse = await c.env.ASSETS.fetch(new URL('/C.html', c.req.url));
  if (!cHtmlResponse.ok) {
      throw new Error(`Asset Not Found: Gagal mengambil /C.html`);
  }
  
  let html = await cHtmlResponse.text();
  const injectionScript = `<script>window.MQTT_CREDENTIALS = { user: "${credentials.user}", pass: "${credentials.pass}" }; window.ID = ${credentials.id};</script>`;
  html = html.replace('</body>', `${injectionScript}</body>`);
  
  return c.html(html);
})

// Export
export default {
  fetch: app.fetch,
  TokenLocker: TokenLocker, 
}