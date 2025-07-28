// src/index.js

import { Hono } from 'hono';

// Fungsi helper untuk menghasilkan token, bisa ditaruh di sini
function generateSecureToken(length = 16) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * ====================================================================
 *  Kelas Durable Object (ClaimLockDO) - TIDAK ADA PERUBAHAN
 * ====================================================================
 */
export class ClaimLockDO {
  constructor(state, env) { this.state = state; this.env = env; }
  async fetch(request) {
    if (request.method === 'DELETE') {
      await this.state.storage.deleteAll();
      console.log(`State for DO ${this.state.id.toString()} has been wiped.`);
      return new Response("State deleted", { status: 200 });
    }
    const url = new URL(request.url), token = url.pathname.split('/').pop(), currentIp = request.headers.get("CF-Connecting-IP") || "unknown";
    const claimRecord = await this.state.storage.get("claimRecord");
    if (claimRecord) {
      if (claimRecord.claimantIp === currentIp) {
        const credentials = await this.env.TOKEN.get(token, { type: 'json' });
        return new Response(JSON.stringify({ status: "success", credentials: credentials || null }), { headers: { 'Content-Type': 'application/json' } });
      } else { return new Response(JSON.stringify({ status: "taken" })); }
    }
    const credentials = await this.env.TOKEN.get(token, { type: 'json' });
    if (!credentials) { return new Response(JSON.stringify({ status: "invalid" })); }
    await this.state.storage.put("claimRecord", { claimantIp: currentIp, timestamp: new Date().toISOString() });
    return new Response(JSON.stringify({ status: "success", credentials }), { headers: { 'Content-Type': 'application/json' } });
  }
}

/**
 * ====================================================================
 *  Aplikasi Hono - Dengan Rute Admin
 * ====================================================================
 */
const app = new Hono();

// --- Middleware untuk Autentikasi Admin ---
const adminAuth = async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Basic ')) {
        return c.newResponse('Autentikasi diperlukan.', 401, { 'WWW-Authenticate': 'Basic realm="Admin Area"' });
    }
    try {
        const decodedCreds = atob(authHeader.substring(6));
        const [user, pass] = decodedCreds.split(':');
        const adminData = await c.env.ADMIN.get(`admin:${user}`, 'json');

        if (!adminData || adminData.pass !== pass) {
            return c.newResponse('Username atau password salah.', 401, { 'WWW-Authenticate': 'Basic realm="Admin Area"' });
        }
    } catch (e) {
        return c.newResponse('Format autentikasi tidak valid.', 400);
    }
    // Jika berhasil, lanjutkan ke handler berikutnya
    await next();
};


// --- Grup Rute untuk Admin ---
const admin = new Hono();

// 1. Rute untuk menyajikan halaman admin (HTML + Injeksi Script)
admin.get('/', adminAuth, async (c) => {
    try {
        const asset = await c.env.ASSETS.fetch(new URL('/admin.html', c.req.url));
        let html = await asset.text();
        const mqtt = await c.env.ADMIN.get('MQTT', 'json');
        
        const injectionScript = `<script>window.ADMIN_MQTT_CREDS = {
                user: "${mqtt.user}",
                pass: "${mqtt.pass}"
            };</script>`;
        html = html.replace('</body>', `${injectionScript}</body>`);
        
        const response = new Response(html, asset);
        response.headers.set('Content-Type', 'text/html;charset=UTF-8');
        return response;
    } catch (e) {
        return c.text('Gagal memuat halaman admin.', 500);
    }
});


// 2. Rute untuk API token (GET, POST, dll.)
admin.use('/api/admin/token', adminAuth); // Terapkan auth ke semua metode di bawah ini

admin.get('/api/admin/token', async (c) => {
    const list = await c.env.TOKEN.list();
    const promises = list.keys.map(async (key) => ({ key: key.name, value: await c.env.TOKEN.get(key.name, 'json') }));
    let allTokenData = await Promise.all(promises);
    allTokenData = allTokenData.filter(item => item.value && typeof item.value.id !== 'undefined').sort((a, b) => a.value.id - b.value.id);
    return c.json(allTokenData);
});

admin.post('/api/admin/token', async (c) => {
    try {
        const body = await c.req.json();
        const { action, token_key } = body;
        let responseData = { success: true, action };
        const invalidateDoState = async (key) => {
            console.log(`Invalidating DO state for old token: ${key}`);
            const doId = c.env.CLAIM_LOCK_DO.idFromName(key);
            const stub = c.env.CLAIM_LOCK_DO.get(doId);
            // Kirim request DELETE ke DO untuk menghapus state-nya
            await stub.fetch(new Request(`https://do-internal/delete`, { method: 'DELETE' }));
        };


        switch (action) {
            case 'add': {
                const list = await c.env.TOKEN.list();
                const allTokens = await Promise.all(list.keys.map(k => c.env.TOKEN.get(k.name, 'json')));
                const maxId = allTokens.reduce((max, t) => (t && t.id > max ? t.id : max), 0);
                const newToken = generateSecureToken();
                await c.env.TOKEN.put(newToken, JSON.stringify({ id: maxId + 1, user: body.user, pass: body.pass }));
                break;
            }
            case 'update': {
                await c.env.TOKEN.put(token_key, JSON.stringify({ id: body.id, user: body.user, pass: body.pass }));
                break;
            }
            case 'generate_new': {
                const oldData = await c.env.TOKEN.get(token_key, 'json');
                if (oldData) {
                    const newToken = generateSecureToken();
                    await c.env.TOKEN.put(newToken, JSON.stringify(oldData));
                    await c.env.TOKEN.delete(token_key);
                    await invalidateDoState(token_key);
                    responseData.kickedUser = oldData.user;
                }
                break;
            }
            case 'delete': {
                const oldData = await c.env.TOKEN.get(token_key, 'json');
                if (oldData) {
                    await c.env.TOKEN.delete(token_key);
                    await invalidateDoState(token_key);
                    responseData.kickedUser = oldData.user;
                }
                break;
            }
            default: return c.json({ message: 'Aksi tidak valid' }, 400);
        }
        return c.json(responseData);
    } catch (e) {
        return c.json({ message: 'Internal Server Error: ' + e.message }, 500);
    }
});

// Daftarkan grup rute admin ke aplikasi utama
app.route('/', admin);


// --- Rute Pengguna (Token Claim) ---
app.get('/:token', async (c) => {
  // ... (kode ini tetap sama persis seperti sebelumnya) ...
  const { token } = c.req.param();
  const request = c.req.raw;

  const doId = c.env.CLAIM_LOCK_DO.idFromName(token);
  const stub = c.env.CLAIM_LOCK_DO.get(doId);
  
  const doResponse = await stub.fetch(request);
  const { status, credentials } = await doResponse.json();

  switch (status) {
    case "success":
      if (!credentials) return c.env.ASSETS.fetch(new URL('/invalid.html', request.url));
      try {
        const asset = await c.env.ASSETS.fetch(new URL('/C.html', request.url));
        let html = await asset.text();
        const injectionScript = `<script>window.MQTT_CREDENTIALS = ${JSON.stringify({ user: credentials.user, pass: credentials.pass })};window.ID = ${JSON.stringify(credentials.id)};</script>`;
        html = html.replace('</body>', `${injectionScript}</body>`);
        const response = new Response(html, asset);
        response.headers.set('Content-Type', 'text/html;charset=UTF-8');
        return response;
      } catch (e) {
        return c.text('Gagal memuat halaman C.html.', 500);
      }
    case "taken":
      return c.env.ASSETS.fetch(new URL('/taken.html', request.url));
    case "invalid":
    default:
      return c.env.ASSETS.fetch(new URL('/invalid.html', request.url));
  }
});

// Fallback untuk menyajikan file statis (CSS, JS Client) dan root
app.get('*', (c) => {
    // Penting! Pastikan file admin.css dan admin.client.js bisa diakses tanpa auth
    return c.env.ASSETS.fetch(c.req.raw);
});

// Ekspor worker dan kelas DO
export default {
  fetch: app.fetch,
  ClaimLockDO: ClaimLockDO,
};