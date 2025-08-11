// File: src/durable-objects/websocket.do.js (VERSI PERBAIKAN)

// 1. WAJIB: Impor kelas dasar dari modul runtime Cloudflare Workers.
import { DurableObject } from "cloudflare:workers";

// 2. WAJIB: Gunakan "extends DurableObject" untuk mewarisi fungsionalitas.
export class WebSocketDO extends DurableObject {
    streamer = null;
    viewers = new Set();
    latestOffer = null;
    idMobil; // Ini akan kita isi di constructor

    // 3. WAJIB: Constructor harus menerima (ctx, env) dan memanggil super().
    constructor(ctx, env) {
        super(ctx, env); // Ini akan menginisialisasi konteks (`this.ctx`) dan env (`this.env`)
        
        // Sekarang, this.ctx sudah ada dan kita bisa mengakses id.name
        this.idMobil = this.ctx.id.name; 
    }

    async fetch(request) {
        const url = new URL(request.url);
        // Menggunakan this.idMobil yang sudah di-set di constructor
        console.log(`[DO ${this.idMobil}] Received fetch for: ${url.pathname}`);

        if (url.pathname === '/_set_stream_secret') {
            console.log(`[DO ${this.idMobil}] Handling '/_set_stream_secret'`);
            if (request.method !== 'POST') {
                return new Response('Method Not Allowed', { status: 405 });
            }
            const streamSecret = await request.text();
            if (!streamSecret) {
                console.error(`[DO ${this.idMobil}] Attempted to set an empty secret.`);
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
            console.error(`[DO ${this.idMobil}] AUTH_FAIL: Missing auth token.`);
            return new Response('Auth token required', { status: 401 });
        }
        console.log(`[DO ${this.idMobil}] Auth token from URL: ${authToken.substring(0, 8)}...`);

        let role = null;
        
        const storedSecret = await this.ctx.storage.get('stream_secret');
        console.log(`[DO ${this.idMobil}] Secret from storage: ${storedSecret ? storedSecret.substring(0, 8) + '...' : 'NOT FOUND'}`);
        
        if (storedSecret && authToken === storedSecret) {
            role = 'streamer';
            console.log(`[DO ${this.idMobil}] AUTH_SUCCESS: Role is 'streamer'.`);
        } else {
            console.log(`[DO ${this.idMobil}] Not a streamer, checking DB for viewer token...`);
            try {
                const ps = this.env.DB.prepare('SELECT id_mobil FROM tokens WHERE token = ? AND claimed_by_ip IS NOT NULL');
                const tokenData = await ps.bind(authToken).first();

                if (tokenData && tokenData.id_mobil === this.idMobil) {
                    role = 'viewer';
                    console.log(`[DO ${this.idMobil}] AUTH_SUCCESS: Role is 'viewer'.`);
                } else {
                    console.error(`[DO ${this.idMobil}] AUTH_FAIL: Viewer token invalid or for wrong car.`);
                }
            } catch (dbError) {
                console.error(`[DO ${this.idMobil}] CRITICAL: D1 DB query failed.`, dbError);
                return new Response('Internal DB Error', { status: 500 });
            }
        }

        if (!role) {
            console.error(`[DO ${this.idMobil}] AUTH_FAIL: No valid role. Denying connection.`);
            return new Response('Invalid auth token', { status: 403 });
        }
        
        const [client, server] = Object.values(new WebSocketPair());
        this.handleSession(server, role);
        return new Response(null, { status: 101, webSocket: client });
    }

    // Metode handleSession dan handleMessage tidak perlu diubah, biarkan seperti sebelumnya.
    handleSession(socket, role) {
        socket.accept();
        console.log(`[DO ${this.idMobil}] Connection accepted with role: ${role}`);

        if (role === 'streamer') {
            if (this.streamer) {
                this.streamer.close(1000, 'New streamer connected');
            }
            this.streamer = socket;
        } else {
            this.viewers.add(socket);
            if (this.latestOffer) {
                socket.send(JSON.stringify({ type: 'offer', data: this.latestOffer }));
            }
        }

        socket.addEventListener('message', event => {
            this.handleMessage(socket, role, event.data);
        });

        const closeOrErrorHandler = () => {
            if (role === 'streamer' && socket === this.streamer) {
                console.log(`[DO ${this.idMobil}] Streamer disconnected.`);
                this.streamer = null;
                this.latestOffer = null;
                this.viewers.forEach(v => v.send(JSON.stringify({ type: 'streamer-disconnected' })));
            } else if (role === 'viewer') {
                this.viewers.delete(socket);
                console.log(`[DO ${this.idMobil}] A viewer disconnected.`);
            }
        };
        socket.addEventListener('close', closeOrErrorHandler);
        socket.addEventListener('error', closeOrErrorHandler);
    }
    
    handleMessage(senderSocket, role, message) {
        try {
            const signal = JSON.parse(message);

            if (role === 'streamer') {
                if (signal.type === 'offer') {
                    this.latestOffer = signal.data;
                    this.viewers.forEach(v => v.send(message));
                } else if (signal.type === 'candidate') {
                    this.viewers.forEach(v => v.send(message));
                }
            } 
            else if (role === 'viewer') {
                if (signal.type === 'answer' || signal.type === 'candidate') {
                    if (this.streamer && this.streamer.readyState === WebSocket.OPEN) {
                        this.streamer.send(message);
                    }
                }
            }
        } catch (error) {
            console.error(`[DO ${this.idMobil}] Failed to handle WebSocket message:`, error);
        }
    }
}