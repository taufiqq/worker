// File: src/routes/websocket.js

/**
 * Menangani permintaan upgrade ke WebSocket.
 * Fungsi ini akan mencari Durable Object yang sesuai berdasarkan sessionId
 * dan meneruskan permintaan ke sana.
 * @param c - Konteks Hono
 */
export const handleWebSocketUpgrade = (c) => {
    // Ambil sessionId dari parameter URL, contoh: /ws/abcdef123456
    const sessionId = c.req.param('sessionId');

    // Validasi sederhana untuk memastikan sessionId ada dan tidak aneh
    if (!sessionId || sessionId.length < 10) {
      return new Response("Invalid or missing Session ID", { status: 400 });
    }

    try {
        // Dapatkan ID unik untuk Durable Object dari nama sesi.
        // `idFromName` memastikan bahwa sessionId yang sama akan selalu merujuk ke instance DO yang sama.
        const doId = c.env.WEBSOCKET_DO.idFromName(sessionId);
        
        // Dapatkan "stub" atau perwakilan dari Durable Object tersebut.
        const doStub = c.env.WEBSOCKET_DO.get(doId);

        // Teruskan permintaan (beserta header 'Upgrade: websocket') ke Durable Object.
        // DO akan menangani proses upgrade dan mengembalikan respons 101 Switching Protocols.
        return doStub.fetch(c.req.raw);

    } catch (error) {
        // Tangani jika ada kesalahan saat mengakses DO (misalnya, binding tidak ada)
        console.error("Error accessing Durable Object:", error);
        return new Response("Could not establish WebSocket connection.", { status: 500 });
    }
};