// src/routes/websocket.js (PERBAIKAN)
export const handleWebSocketUpgrade = (c) => {
    const sessionId = c.req.param('sessionId');

    // Ubah validasi menjadi seperti ini. Cukup pastikan tidak kosong.
    if (!sessionId) {
      return new Response("Missing Session ID", { status: 400 });
    }

    try {
        const doId = c.env.WEBSOCKET_DO.idFromName(sessionId);
        const doStub = c.env.WEBSOCKET_DO.get(doId);
        return doStub.fetch(c.req.raw);
    } catch (error) {
        console.error("Error accessing Durable Object:", error);
        return new Response("Could not establish WebSocket connection.", { status: 500 });
    }
};