// src/index.js

import { Hono } from 'hono';

/**
 * ====================================================================
 *  Definisi Kelas Durable Object (ClaimLockDO)
 * ====================================================================
 * Setiap instance DO ini mewakili satu 'uniqueId'.
 * Ia hanya memiliki satu tugas: memeriksa dan mengklaim sebuah kunci.
 */
export class ClaimLockDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    // this.state.storage adalah penyimpanan Key-Value yang persisten
  }

  // fetch() adalah API untuk DO kita.
  async fetch(request) {
    // Cek apakah 'claimant' sudah ada di penyimpanan.
    // 'this.state.storage.get()' adalah atomik untuk instance DO ini.
    let claimant = await this.state.storage.get("claimant");

    if (claimant) {
      // Jika sudah ada, berarti ID ini sudah diklaim.
      // Kita kembalikan status "taken".
      console.log(`ID sudah diklaim oleh: ${claimant}`);
      return new Response("taken");
    } else {
      // Jika belum ada, ini adalah kesempatan pertama!
      // Ambil info siapa yang mencoba mengklaim (misal, dari IP).
      const newClaimant = request.headers.get("CF-Connecting-IP") || "unknown";
      
      // Simpan claimant baru. Operasi ini mengunci ID ini.
      await this.state.storage.put("claimant", newClaimant);
      
      console.log(`ID berhasil diklaim oleh: ${newClaimant}`);
      // Kembalikan status "success".
      return new Response("success");
    }
  }
}

/**
 * ====================================================================
 *  Aplikasi Hono (Worker Entrypoint)
 * ====================================================================
 */
const app = new Hono();

// Rute utama yang menangani link unik, misalnya /abc, /xyz123
// Parameter ':id' akan menangkap apapun setelah slash pertama.
app.get('/:id', async (c) => {
  const { id } = c.req.param();

  // Validasi sederhana, jangan proses untuk file aset yang umum
  if (id.includes('.')) {
      return c.env.ASSETS.fetch(c.req.raw);
  }

  // Dapatkan ID Durable Object yang konsisten berdasarkan 'id' dari URL.
  // Ini memastikan '/aaa' selalu pergi ke DO yang sama.
  const doId = c.env.CLAIM_LOCK_DO.idFromName(id);
  
  // Dapatkan stub untuk berkomunikasi dengan DO tersebut.
  const stub = c.env.CLAIM_LOCK_DO.get(doId);

  // Kirim permintaan ke DO dan tunggu responsnya.
  const doResponse = await stub.fetch(c.req.raw);
  const status = await doResponse.text(); // "success" atau "taken"

  // Berdasarkan respons dari DO, sajikan halaman HTML yang sesuai.
  if (status === 'success') {
    return c.env.ASSETS.fetch(new URL('/success.html', c.req.url));
  } else {
    return c.env.ASSETS.fetch(new URL('/taken.html', c.req.url));
  }
});

// Fallback untuk root dan file aset lainnya
app.get('*', (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default {
  fetch: app.fetch,
  ClaimLockDO: ClaimLockDO, // Ekspor kelas DO agar Cloudflare bisa menemukannya
};