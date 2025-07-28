// src/index.js

import { Hono } from 'hono';

/**
 * ====================================================================
 *  Definisi Kelas Durable Object (ClaimLockDO) - DENGAN LOGIKA IP
 * ====================================================================
 */
export class ClaimLockDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const token = url.pathname.split('/').pop();

    // Dapatkan IP pengunjung saat ini dari header Cloudflare
    const currentIp = request.headers.get("CF-Connecting-IP") || "unknown";

    // Langkah 1: Cek apakah ada catatan klaim yang sudah ada
    // Kita simpan objek, bukan hanya boolean, agar bisa menampung IP
    const claimRecord = await this.state.storage.get("claimRecord");

    if (claimRecord) {
      // --- KASUS: TOKEN SUDAH PERNAH DIKLAIM ---
      
      // Cek apakah IP pengunjung saat ini sama dengan IP pengklaim asli
      if (claimRecord.claimantIp === currentIp) {
        // IP SAMA: Ini adalah pemilik asli yang me-refresh. Beri akses lagi.
        // Kita perlu mengambil ulang kredensial dari KV.
        console.log(`IP Match: User ${currentIp} re-accessing token.`);
        const credentials = await this.env.TOKEN.get(token, { type: 'json' });
        if (credentials) {
            return new Response(JSON.stringify({ status: "success", credentials: credentials }), { headers: { 'Content-Type': 'application/json' } });
        } else {
            // Seharusnya tidak terjadi, tapi sebagai pengaman jika data KV dihapus
            return new Response(JSON.stringify({ status: "invalid" }));
        }
      } else {
        // IP BERBEDA: Ini adalah orang lain yang mencoba mengakses. Tolak.
        console.log(`IP Mismatch: User ${currentIp} tried to access token claimed by ${claimRecord.claimantIp}.`);
        return new Response(JSON.stringify({ status: "taken" }));
      }
    }

    // --- KASUS: TOKEN BELUM PERNAH DIKLAIM ---
    // Lanjutkan alur verifikasi ke KV
    const credentials = await this.env.TOKEN.get(token, { type: 'json' });

    if (!credentials) {
      // Token tidak valid di KV. Kembalikan "invalid" dan jangan klaim apa pun.
      return new Response(JSON.stringify({ status: "invalid" }));
    }

    // Token valid! Sekarang kita klaim dengan menyimpan catatan berisi IP.
    await this.state.storage.put("claimRecord", {
      claimantIp: currentIp,
      timestamp: new Date().toISOString()
    });

    console.log(`Token ${token} successfully claimed by IP: ${currentIp}`);
    // Kembalikan status "success" beserta kredensialnya.
    return new Response(JSON.stringify({
      status: "success",
      credentials: credentials,
    }), { headers: { 'Content-Type': 'application/json' } });
  }
}

/**
 * ====================================================================
 *  Aplikasi Hono (Titik Masuk Worker) - TIDAK ADA PERUBAHAN
 * ====================================================================
 * Bagian ini tetap sama karena DO sudah melakukan semua pekerjaan berat.
 */
const app = new Hono();

app.get('/:token', async (c) => {
  const { token } = c.req.param();
  const request = c.req.raw;

  const doId = c.env.CLAIM_LOCK_DO.idFromName(token);
  const stub = c.env.CLAIM_LOCK_DO.get(doId);
  
  const doResponse = await stub.fetch(request);
  const { status, credentials } = await doResponse.json();

  switch (status) {
    case "success":
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

app.get('*', (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default {
  fetch: app.fetch,
  ClaimLockDO: ClaimLockDO,
};