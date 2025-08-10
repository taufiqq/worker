// src/durable-objects/websocket.do.js

export class WebSocketDO {
    constructor(state) {
        this.state = state;
        this.sockets = new Set();
    }

    async fetch(request) {
        const upgradeHeader = request.headers.get('Upgrade');
        if (!upgradeHeader || upgradeHeader !== 'websocket') {
            return new Response('Expected Upgrade: websocket', { status: 426 });
        }

        const [client, server] = Object.values(new WebSocketPair());

        await this.handleSession(server);

        return new Response(null, {
            status: 101,
            webSocket: client,
        });
    }

    async handleSession(server) {
        server.accept();
        this.sockets.add(server);

        server.addEventListener('message', event => {
            this.broadcast(server, event.data);
        });

        const closeOrErrorHandler = () => {
            this.sockets.delete(server);
        };
        server.addEventListener('close', closeOrErrorHandler);
        server.addEventListener('error', closeOrErrorHandler);
    }

    broadcast(sender, message) {
        for (const socket of this.sockets) {
            if (socket !== sender && socket.readyState === WebSocket.OPEN) {
                try {
                   socket.send(message);
                } catch (error) {
                    console.error("Failed to send message to a socket:", error);
                    this.sockets.delete(socket); // Hapus socket yang bermasalah
                }
            }
        }
    }
}