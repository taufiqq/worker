// src/durable-objects/claimLock.do.js

/**
 * ====================================================================
 *  Definisi Kelas Durable Object (ClaimLockDO)
 *  Tugas: Mengelola state "terklaim" untuk setiap token secara unik.
 * ====================================================================
 */
export class ClaimLockDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    // Jika DO ini menerima request dengan metode DELETE, hapus semua state-nya.
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
      if (claimRecord.claimantIp === currentIp) {
        // IP SAMA: Pemilik asli me-refresh. Beri akses lagi.
        const credentials = await this.env.TOKEN.get(token, { type: 'json' });
        if (!credentials) {
            return new Response(JSON.stringify({ status: "invalid" }));
        }
        return new Response(JSON.stringify({ status: "success", credentials: credentials }), { headers: { 'Content-Type': 'application/json' } });
      } else {
        // IP BERBEDA: Orang lain mencoba mengakses. Tolak.
        return new Response(JSON.stringify({ status: "taken" }));
      }
    }

    // KASUS 2: Token ini belum pernah diklaim. Verifikasi dulu di KV.
    const credentials = await this.env.TOKEN.get(token, { type: 'json' });
    if (!credentials) {
      return new Response(JSON.stringify({ status: "invalid" }));
    }

    // Token valid! Klaim dengan menyimpan catatan berisi IP.
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