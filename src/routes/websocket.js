// src/routes/websocket.js (VERSI PALING AMAN)
export const handleWebSocketUpgrade = (c) => {
    const sessionId = c.req.param('sessionId');

    // Validasi yang paling penting
    if (!sessionId) {
      // Ini akan terjadi jika fpv-receiver.js mengirim URL seperti /ws/undefined
      console.error("WEBSOCKET_UPGRADE_FAIL: Session ID tidak ada di URL.");
      return new Response("Missing Session ID", { status: 400 });
    }

    try {
        console.log(`Meneruskan permintaan WebSocket ke DO dengan nama: ${sessionId}`);
        const doId = c.env.WEBSOCKET_DO.idFromName(sessionId);
        const doStub = c.env.WEBSOCKET_DO.get(doId);
        return doStub.fetch(c.req.raw);
    } catch (error) {
        console.error("Error saat mengakses Durable Object:", error);
        return new Response("Could not establish WebSocket connection.", { status: 500 });
    }
};