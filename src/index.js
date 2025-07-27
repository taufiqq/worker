// File: src/index.js

/**
 * -----------------------------------------------------------------------------
 *  Bagian 1: Durable Object Class - Otak dari Operasi
 *  Class 'TokenLocker' akan menangani logika untuk satu token spesifik.
 *  Setiap token akan memiliki instance 'TokenLocker'-nya sendiri.
 * -----------------------------------------------------------------------------
 */
export class TokenLocker {
  constructor(state, env) {
    // 'state' adalah storage khusus untuk instance Durable Object ini.
    // Ini didukung oleh SQLite di belakang layar dan sangat konsisten.
    this.state = state;
  }

  // Metode 'fetch' akan dieksekusi setiap kali ada request ke instance Object ini.
  async fetch(request) {
    // Ambil alamat IP klien dari header request.
    const ipAddress = request.headers.get('CF-Connecting-IP');

    // Coba baca siapa pemegang token dari storage.
    // 'storage.get()' bersifat atomik dan konsisten.
    const holderIp = await this.state.storage.get('holderIp');

    if (holderIp) {
      // KASUS 1: Token sudah ada yang memiliki.
      if (holderIp === ipAddress) {
        // Pemilik yang sama mencoba akses lagi. Beri izin.
        return new Response(`Akses diberikan kembali untuk IP: ${ipAddress}`, { status: 200 });
      } else {
        // Orang lain dengan IP berbeda mencoba merebut. Tolak!
        return new Response(`Akses ditolak. Token ini sudah dikunci oleh IP lain.`, { status: 403 });
      }
    } else {
      // KASUS 2: Token belum ada pemiliknya. Inilah pemenangnya!
      
      // Simpan alamat IP pemenang ke storage.
      // Operasi 'put()' ini juga atomik. Request berikutnya yang masuk
      // akan melihat nilai ini.
      await this.state.storage.put('holderIp', ipAddress);

      // Beri pesan sukses. Di sini Anda bisa menyajikan halaman game (C.html).
      return new Response(`Selamat! Token berhasil dikunci oleh IP: ${ipAddress}.`, { status: 200 });
    }
  }
}


/**
 * -----------------------------------------------------------------------------
 *  Bagian 2: Worker Utama - Penjaga Gerbang
 *  Worker ini adalah titik masuk utama. Tugasnya hanya satu:
 *  Menerima request, mengekstrak nama token, dan meneruskannya ke
 *  Durable Object yang tepat.
 * -----------------------------------------------------------------------------
 */
export default {
  async fetch(request, env, ctx) {
    // Ekstrak path dari URL, misal: '/my-secret-token'
    const url = new URL(request.url);
    const path = url.pathname.slice(1); // Hapus '/' di awal

    if (!path) {
      return new Response("Silakan akses menggunakan sebuah token, contoh: /token123", { status: 400 });
    }

    // Buat ID untuk Durable Object.
    // Kita gunakan nama token sebagai ID, agar semua request ke '/token123'
    // selalu menuju ke instance Object yang sama.
    // 'idFromName' memastikan string yang sama akan menghasilkan ID yang sama.
    const id = env.TOKEN_LOCKER.idFromName(path);

    // Dapatkan "stub" atau referensi ke instance Durable Object yang spesifik.
    const obj = env.TOKEN_LOCKER.get(id);

    // Teruskan request dari pengguna ke Durable Object.
    // Worker akan menunggu respons dari Object dan mengirimkannya kembali ke pengguna.
    return obj.fetch(request);
  },
};