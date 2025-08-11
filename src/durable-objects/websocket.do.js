// File: src/durable-objects/websocket.do.js (CARA YANG BENAR)

// 1. Impor kelas dasar DurableObject dari runtime.
import { DurableObject } from "cloudflare:workers";

// 2. Gunakan "extends" untuk mewarisi fungsionalitas DO.
export class WebSocketDO extends DurableObject {
    // Properti state tidak perlu didefinisikan ulang, ia ada di 'this.ctx'.
    sockets;

    // 3. Constructor HARUS menerima ctx dan env, lalu memanggil super().
    constructor(ctx, env) {
        super(ctx, env); // WAJIB memanggil constructor kelas induk.
        this.sockets = new Set();
    }

    // Metode fetch dan lainnya tetap sama.
    async fetch(request) {
        const upgradeHeader = request.headers.get('Upgrade');
        if (!upgradeHeader || upgradeHeader !== 'websocket') {
            return new Response('Expected Upgrade: websocket', { status: 426 });
        }
        const [client, server] = Object.values(new WebSocketPair());
        this.handleSession(server);
        return new Response(null, {
            status: 101,
            webSocket: client,
        });
    }

    handleSession(socket) {
        socket.accept();
        this.sockets.add(socket);
        socket.addEventListener('message', event => {
            this.broadcast(socket, event.data);
        });
        const closeOrErrorHandler = () => {
            this.sockets.delete(socket);
        };
        socket.addEventListener('close', closeOrErrorHandler);
        socket.addEventListener('error', closeOrErrorHandler);
    }

    broadcast(sender, message) {
        for (const socket of this.sockets) {
            if (socket !== sender && socket.readyState === WebSocket.OPEN) {
                try {
                    socket.send(message);
                } catch (error) {
                    this.sockets.delete(socket);
                }
            }
        }
    }
}