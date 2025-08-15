// --- START OF FILE src/routes/simple-webrtc.js ---

// Handler untuk halaman HTML
export const handleSimpleSenderPage = (c) => c.env.ASSETS.fetch(new URL('/simple-sender.html', c.req.url));
export const handleSimpleReceiverPage = (c) => c.env.ASSETS.fetch(new URL('/simple-receiver.html', c.req.url));

// Handler untuk upgrade WebSocket
export const handleSimpleWebSocketUpgrade = (c) => {
    const sessionId = c.req.param('sessionId');
    const role = c.req.query('role');
    
    if (!sessionId || !role) {
        return new Response("Missing sessionId or role", { status: 400 });
    }

    try {
        const doId = c.env.SIMPLE_WEBRTC_DO.idFromName(sessionId); // Gunakan nama sesi sebagai ID
        const doStub = c.env.SIMPLE_WEBRTC_DO.get(doId);
        
        // Teruskan sessionId dan role ke dalam DO melalui URL
        const url = new URL(c.req.url);
        url.searchParams.set('sessionId', sessionId);
        url.searchParams.set('role', role);

        const request = new Request(url, c.req.raw);

        return doStub.fetch(request);
    } catch (error) {
        console.error("Error accessing SimpleWebRTC DO:", error);
        return new Response("Could not establish WebSocket connection.", { status: 500 });
    }
};