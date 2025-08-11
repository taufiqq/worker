// File: src/durable-objects/websocket.do.js (VERSI FINAL & BERSIH)

// 1. WAJIB: Impor kelas dasar dari modul runtime Cloudflare Workers.
import { DurableObject } from "cloudflare:workers";

// 2. WAJIB: Gunakan "extends DurableObject" untuk mewarisi fungsionalitas.
export class WebSocketDO extends DurableObject {
    streamer = null;
    viewers = new Set();
    latestOffer = null;
    idMobil;

    // 3. WAJIB: Constructor harus menerima (ctx, env) dan memanggil super().
    constructor(ctx, env) {
        super(ctx, env);
        // `this.ctx` sekarang dijamin ada oleh `super(ctx, env)`
        this.idMobil = this.ctx.id.name;
    }

    async fetch(request) {
        const url = new URL(request.url);
        console.log(`[DO ${this.idMobil}] Received fetch for: ${url.pathname}`);

        if (url.pathname === '/_set_stream_secret') {
            console.log(`[DO ${this.idMobil}] Handling '/_set_stream_secret'`);
            const streamSecret = await request.text();
            if (!streamSecret) {
                return new Response('Secret cannot be empty', { status: 400 });
            }
            await this.ctx.storage.put('stream_secret', streamSecret);
            console.log(`[DO ${this.idMobil}] SUCCESS: Stream secret stored.`);
            return new Response('Secret stored', { status: 200 });
        }
        
        const upgradeHeader = request.headers.get('Upgrade');
        if (!upgradeHeader || upgradeHeader !== 'websocket') {
            return new Response('Expected Upgrade: websocket', { status: 426 });
        }

        console.log(`[DO ${this.idMobil}] Handling WebSocket upgrade...`);
        const authToken = url.searchParams.get('auth');
        if (!authToken) {
            return new Response('Auth token required', { status: 401 });
        }

        let role = null;
        const storedSecret = await this.ctx.storage.get('stream_secret');
        
        if (storedSecret && authToken === storedSecret) {
            role = 'streamer';
            console.log(`[DO ${this.idMobil}] AUTH_SUCCESS: Role is 'streamer'.`);
        } else {
            const ps = this.env.DB.prepare('SELECT id_mobil FROM tokens WHERE token = ? AND claimed_by_ip IS NOT NULL');
            const tokenData = await ps.bind(authToken).first();

            if (tokenData && tokenData.id_mobil === this.idMobil) {
                role = 'viewer';
                console.log(`[DO ${this.idMobil}] AUTH_SUCCESS: Role is 'viewer'.`);
            }
        }

        if (!role) {
            console.error(`[DO ${this.idMobil}] AUTH_FAIL: No valid role for token ${authToken.substring(0,4)}...`);
            return new Response('Invalid auth token', { status: 403 });
        }
        
        const [client, server] = Object.values(new WebSocketPair());
        this.handleSession(server, role);
        return new Response(null, { status: 101, webSocket: client });
    }

    handleSession(socket, role) {
        socket.accept();
        console.log(`[DO ${this.idMobil}] Connection accepted with role: ${role}`);

        if (role === 'streamer') {
            if (this.streamer) this.streamer.close(1000, 'New streamer connected');
            this.streamer = socket;
        } else {
            this.viewers.add(socket);
            if (this.latestOffer) {
                socket.send(JSON.stringify({ type: 'offer', data: this.latestOffer }));
            }
        }

        socket.addEventListener('message', event => this.handleMessage(socket, role, event.data));
        const closeOrErrorHandler = () => {
            if (role === 'streamer' && socket === this.streamer) {
                this.streamer = null; this.latestOffer = null;
                this.viewers.forEach(v => v.send(JSON.stringify({ type: 'streamer-disconnected' })));
            } else if (role === 'viewer') {
                this.viewers.delete(socket);
            }
        };
        socket.addEventListener('close', closeOrErrorHandler);
        socket.addEventListener('error', closeOrErrorHandler);
    }
    
    handleMessage(senderSocket, role, message) {
        try {
            const signal = JSON.parse(message);
            if (role === 'streamer') {
                if (signal.type === 'offer') this.latestOffer = signal.data;
                this.viewers.forEach(v => v.send(message));
            } else if (role === 'viewer') {
                if (this.streamer) this.streamer.send(message);
            }
        } catch (error) {
            console.error(`[DO ${this.idMobil}] Failed to handle WebSocket message:`, error);
        }
    }
}