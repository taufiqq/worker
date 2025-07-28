// src/index.js - VERSI FINAL DAN LENGKAP

import { Hono } from 'hono';

/**
 * Fungsi helper untuk menghasilkan token acak yang aman.
 */
function generateSecureToken(length = 16) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * ====================================================================
 *  Definisi Kelas Durable Object (ClaimLockDO)
 *  Tugas: Mengelola state "terklaim" untuk setiap token secara unik.
 * ====================================================================
 */
export class ClaimLockDO {
  constructor(state, env) {
    this.state = state;
    // env (termasuk binding KV `TOKEN`) diteruskan secara otomatis oleh runtime
    this.env = env;
  }

  async fetch(request) {
    // Jika DO ini menerima request dengan metode DELETE, hapus semua state-nya.
    // Ini dipanggil oleh API admin untuk membersihkan state token yang sudah dihapus.
    if (request.method === 'DELETE') {
      await this.state.storage.deleteAll();
      console.log(`State for DO ${this.state.id.toString()} has been wiped.`);
      return new Response("State deleted", { status: 200 });
    }

    // Logika normal untuk klaim token (untuk request GET)
    const url = new URL(request.url);
    const token = url.pathname.split('/').pop();
    const currentIp = request.headers.get("CF-Connecting-IP") || "unknown";

    const claimRecord = await this.state.storage.get("claimRecord");

    // KASUS 1: Token ini sudah pernah diklaim
    if (claimRecord) {
      // Cek apakah IP pengunjung saat ini sama dengan IP pengklaim asli
      if (claimRecord.claimantIp === currentIp) {
        // IP SAMA: Ini adalah pemilik asli yang me-refresh. Beri akses lagi.
        const credentials = await this.env.TOKEN.get(token, { type: 'json' });
        // Jika user refresh tapi admin sudah hapus tokennya, anggap tidak valid.
        if (!credentials) {
            return new Response(JSON.stringify({ status: "invalid" }));
        }
        return new Response(JSON.stringify({ status: "success", credentials: credentials }), { headers: { 'Content-Type': 'application/json' } });
      } else {
        // IP BERBEDA: Ini adalah orang lain yang mencoba mengakses. Tolak.
        return new Response(JSON.stringify({ status: "taken" }));
      }
    }

    // KASUS 2: Token ini belum pernah diklaim. Verifikasi dulu di KV.
    const credentials = await this.env.TOKEN.get(token, { type: 'json' });

    if (!credentials) {
      // Token tidak valid di KV. Jangan klaim apa pun.
      return new Response(JSON.stringify({ status: "invalid" }));
    }

    // Token valid! Sekarang kita klaim dengan menyimpan catatan berisi IP.
    await this.state.storage.put("claimRecord", {
      claimantIp: currentIp,
      timestamp: new Date().toISOString()
    });
    
    // Kembalikan status "success" beserta kredensialnya.
    return new Response(JSON.stringify({
      status: "success",
      credentials: credentials,
    }), { headers: { 'Content-Type': 'application/json' } });
  }
}

/**
 * ====================================================================
 *  Aplikasi Hono - Titik Masuk dan Router Utama
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


// ==========================================================
// PENDEFINISIAN RUTE
// URUTAN SANGAT PENTING: Rute yang lebih spesifik harus
// didefinisikan sebelum rute yang lebih generik (catch-all).
// ==========================================================

// --- RUTE #1: Admin Panel (Sangat Spesifik) ---
// Menyajikan halaman admin.html dan menyuntikkan data MQTT.
app.get('/admin', adminAuth, async (c) => {
    try {
        const asset = await c.env.ASSETS.fetch(new URL('/adminn.html', c.req.url));
        let html = await asset.text();
        const mqtt = await c.env.ADMIN.get('MQTT', 'json');
        
        const injectionScript = `<script>window.ADMIN_MQTT_CREDS = ${JSON.stringify(mqtt)};</script>`;
        html = html.replace('</body>', `${injectionScript}</body>`);
        
        const response = new Response(html, asset);
        response.headers.set('Content-Type', 'text/html;charset=UTF-8');
        return response;
    } catch (e) {
        return c.text('Gagal memuat halaman admin. Pastikan file admin.html ada di direktori /public.', 500);
    }
});


// --- RUTE #2: Admin API (Sangat Spesifik) ---
// Menggunakan sub-router Hono untuk kerapian.
const adminApi = new Hono();
adminApi.use('/api/admin/token', adminAuth); // Terapkan auth ke semua metode di bawah ini

adminApi.get('/api/admin/token', async (c) => {
    const list = await c.env.TOKEN.list();
    const promises = list.keys.map(async (key) => ({ key: key.name, value: await c.env.TOKEN.get(key.name, 'json') }));
    let allTokenData = await Promise.all(promises);
    allTokenData = allTokenData.filter(item => item.value && typeof item.value.id !== 'undefined').sort((a, b) => a.value.id - b.value.id);
    return c.json(allTokenData);
});

adminApi.post('/api/admin/token', async (c) => {
    try {
        const body = await c.req.json();
        const { action, token_key } = body;
        let responseData = { success: true, action };

        const invalidateDoState = async (key) => {
            console.log(`Invalidating DO state for old token: ${key}`);
            const doId = c.env.CLAIM_LOCK_DO.idFromName(key);
            const stub = c.env.CLAIM_LOCK_DO.get(doId);
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
                    await invalidateDoState(token_key); // Hapus state DO lama
                    responseData.kickedUser = oldData.user;
                }
                break;
            }
            case 'delete': {
                const oldData = await c.env.TOKEN.get(token_key, 'json');
                if (oldData) {
                    await c.env.TOKEN.delete(token_key);
                    await invalidateDoState(token_key); // Hapus state DO
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
// Daftarkan grup rute API admin ke aplikasi utama
app.route('/', adminApi);


// --- RUTE #3: Token Pengguna (Generik) ---
// Menangkap link seperti /token123, /abc, dll.
// Didefinisikan SETELAH rute admin yang lebih spesifik.
app.get('/:token', async (c) => {
  const { token } = c.req.param();
  const request = c.req.raw;

  // Jangan proses file aset (seperti admin.css) sebagai token.
  if (token.includes('.')) {
    return c.env.ASSETS.fetch(request);
  }

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


// --- RUTE #4: Fallback untuk Aset Statis dan Root ---
// Menangkap permintaan untuk file seperti /admin.css, /admin.client.js, atau "/"
app.get('*', (c) => {
    return c.env.ASSETS.fetch(c.req.raw);
});


// --- Ekspor Worker dan Durable Object ---
export default {
  fetch: app.fetch,
  ClaimLockDO: ClaimLockDO, // Pastikan kelas DO diekspor di level atas
};