// File: src/index.js (DENGAN LOGGING DIAGNOSTIK)

import { Hono } from 'hono'
import { serveStatic } from 'hono/cloudflare-workers'

export class TokenLocker {
  constructor(state, env) {
    this.state = state;
  }

  async fetch(request) {
    try {
      const ipAddress = request.headers.get('CF-Connecting-IP') || 'unknown';
      // Log saat DO dipanggil
      console.log(`[DO] Fetch received for IP: ${ipAddress}`);

      const holderIp = await this.state.storage.get('holderIp');
      console.log(`[DO] Current holder IP from storage: ${holderIp}`);

      if (holderIp) {
        if (holderIp === ipAddress) {
          console.log(`[DO] Access granted for existing holder: ${ipAddress}`);
          return new Response("OK", { status: 200 });
        } else {
          console.log(`[DO] Access denied. Token held by ${holderIp}, attempted by ${ipAddress}`);
          return new Response("Token ini sudah digunakan oleh IP lain.", { status: 403 });
        }
      } else {
        console.log(`[DO] No holder found. Locking token for: ${ipAddress}`);
        await this.state.storage.put('holderIp', ipAddress);
        return new Response("OK", { status: 200 });
      }
    } catch (e) {
      // Jika ada error di dalam DO, catat!
      console.error("[DO] FATAL ERROR:", e.stack);
      return new Response("Internal Server Error in Durable Object", { status: 500 });
    }
  }
}

const app = new Hono()

// Middleware logging untuk setiap request masuk
app.use('*', async (c, next) => {
  console.log(`[Hono] Request received: ${c.req.method} ${c.req.url}`);
  await next();
});

app.use('/*', serveStatic({ root: './' }))

app.get('/:token', async (c) => {
  // Gunakan blok try...catch besar untuk menangkap semua error runtime
  try {
    const { token } = c.req.param();
    console.log(`[Hono] Handling token: "${token}"`);

    // 1. Cek binding KV
    if (!c.env.TOKEN_DB) {
      console.error("[Hono] FATAL: KV Namespace 'TOKEN_DB' is not bound.");
      return c.text("Server configuration error: TOKEN_DB missing.", 500);
    }
    const credentialsRaw = await c.env.TOKEN_DB.get(token);
    console.log(`[Hono] Raw data from KV for token "${token}":`, credentialsRaw);
    if (!credentialsRaw) {
      return c.text(`Token "${token}" tidak valid atau tidak ditemukan.`, 404);
    }
    
    let credentials;
    try {
        credentials = JSON.parse(credentialsRaw);
    } catch(e) {
        console.error(`[Hono] FATAL: Failed to parse JSON from KV for token "${token}". Data: ${credentialsRaw}`);
        return c.text("Data token di server korup.", 500);
    }
    
    // 2. Cek binding DO
    if (!c.env.TOKEN_LOCKER) {
      console.error("[Hono] FATAL: Durable Object 'TOKEN_LOCKER' is not bound.");
      return c.text("Server configuration error: TOKEN_LOCKER missing.", 500);
    }
    const id = c.env.TOKEN_LOCKER.idFromName(token);
    const obj = c.env.TOKEN_LOCKER.get(id);
    
    console.log(`[Hono] Calling Durable Object for token "${token}"`);
    const lockResponse = await obj.fetch(c.req.raw);
    console.log(`[Hono] Response from DO: status ${lockResponse.status}`);

    if (!lockResponse.ok) {
      const errorMessage = await lockResponse.text();
      return c.html(`<h1>Akses Ditolak</h1><p>${errorMessage}</p>`, lockResponse.status);
    }

    // 3. Cek binding Aset
    if (!c.env.ASSETS) {
      console.error("[Hono] FATAL: Static asset binding 'ASSETS' is not configured. Check [site] in wrangler.toml");
      return c.text("Server configuration error: ASSETS missing.", 500);
    }
    const cHtmlResponse = await c.env.ASSETS.fetch(new URL('/C.html', c.req.url));
    if (!cHtmlResponse.ok) {
        console.error(`[Hono] FATAL: Could not fetch /C.html. Status: ${cHtmlResponse.status}`);
        return c.text("Gagal memuat file halaman utama. File tidak ditemukan.", 500);
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
    
    console.log(`[Hono] Successfully processed token "${token}". Serving page.`);
    return c.html(html);

  } catch (e) {
    // Tangkap semua error tak terduga lainnya
    console.error("[Hono] UNHANDLED FATAL ERROR in /:token route:", e.stack);
    return c.text("An unexpected internal server error occurred.", 500);
  }
})

export default {
  fetch: app.fetch,
  TokenLocker: TokenLocker, 
}