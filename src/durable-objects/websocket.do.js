// File: src/durable-objects/websocket.do.js

import { DurableObject } from "cloudflare:workers";
// File: src/durable-objects/websocket.do.js (VERSI DEBUGGING)

import { DurableObject } from "cloudflare:workers";

export class WebSocketDO extends DurableObject {
    streamer = null;
    viewers = new Set();
    latestOffer = null;
    idMobil;

    constructor(ctx, env) {
        super(ctx, env);
        this.idMobil = ctx.id.name;
    }

    async fetch(request) {
        const url = new URL(request.url);
        console.log(`[DO ${this.idMobil}] Received fetch request for: ${url.pathname}`);

        // RUTE 1: Mengatur secret
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
            console.log(`[DO ${this.idMobil}] SUCCESS: Stream secret has been stored.`);
            return new Response('Secret stored', { status: 200 });
        }
        
        // RUTE 2: Upgrade ke WebSocket
        const upgradeHeader = request.headers.get('Upgrade');
        if (!upgradeHeader || upgradeHeader !== 'websocket') {
            return new Response('Expected Upgrade: websocket', { status: 426 });
        }

        console.log(`[DO ${this.idMobil}] Handling WebSocket upgrade request...`);

        // --- GERBANG OTENTIKASI WEBSOCKET ---
        const authToken = url.searchParams.get('auth');
        if (!authToken) {
            console.error(`[DO ${this.idMobil}] AUTH_FAIL: Auth token is missing from URL.`);
            return new Response('Auth token is required via ?auth=... parameter', { status: 401 });
        }
        console.log(`[DO ${this.idMobil}] Auth token from URL: ${authToken.substring(0, 8)}...`);

        let role = null;
        
        const storedSecret = await this.ctx.storage.get('stream_secret');
        console.log(`[DO ${this.idMobil}] Secret from storage: ${storedSecret ? storedSecret.substring(0, 8) + '...' : 'NOT FOUND'}`);
        
        // Cek #1: Apakah ini streamer?
        if (storedSecret && authToken === storedSecret) {
            role = 'streamer';
            console.log(`[DO ${this.idMobil}] AUTH_SUCCESS: Role determined as 'streamer'.`);
        } else {
            console.log(`[DO ${this.idMobil}] Token did not match streamer secret. Checking if it's a viewer token...`);
            // Cek #2: Jika bukan streamer, cek apakah ini viewer yang valid
            try {
                const ps = this.env.DB.prepare('SELECT id_mobil FROM tokens WHERE token = ? AND claimed_by_ip IS NOT NULL');
                const tokenData = await ps.bind(authToken).first();

                if (tokenData) {
                    console.log(`[DO ${this.idMobil}] Found token in DB for mobil: ${tokenData.id_mobil}. This DO is for mobil: ${this.idMobil}.`);
                    if (tokenData.id_mobil === this.idMobil) {
                        role = 'viewer';
                        console.log(`[DO ${this.idMobil}] AUTH_SUCCESS: Role determined as 'viewer'.`);
                    } else {
                        console.error(`[DO ${this.idMobil}] AUTH_FAIL: Token is for a different car.`);
                    }
                } else {
                    console.log(`[DO ${this.idMobil}] Token not found or not claimed in DB.`);
                }
            } catch (dbError) {
                console.error(`[DO ${this.idMobil}] CRITICAL_ERROR: D1 database query failed.`, dbError);
                return new Response('Internal Server Error (DB)', { status: 500 });
            }
        }

        if (!role) {
            console.error(`[DO ${this.idMobil}] AUTH_FAIL: No valid role could be assigned. Denying connection.`);
            return new Response('Invalid or expired auth token', { status: 403 });
        }
        // --- AKHIR GERBANG OTENTIKASI ---

        console.log(`[DO ${this.idMobil}] Proceeding with WebSocket handshake for role: ${role}.`);
        const [client, server] = Object.values(new WebSocketPair());
        this.handleSession(server, role);

        return new Response(null, { status: 101, webSocket: client });
    }

    // Metode handleSession dan handleMessage tidak perlu diubah, biarkan seperti sebelumnya.
    // ...
    // Salin metode handleSession dan handleMessage dari versi sebelumnya ke sini.
    
    handleSession(socket, role) {
        socket.accept();
        console.log(`Connection accepted with role: ${role}`);

        if (role === 'streamer') {
            // Jika sudah ada streamer lama, putuskan koneksinya
            if (this.streamer) {
                this.streamer.close(1000, 'New streamer connected');
            }
            this.streamer = socket;
        } else { // role === 'viewer'
            this.viewers.add(socket);
            // Jika streamer sudah ada dan punya offer, kirimkan ke viewer baru ini
            if (this.latestOffer) {
                socket.send(JSON.stringify({ type: 'offer', data: this.latestOffer }));
            }
        }

        socket.addEventListener('message', event => {
            this.handleMessage(socket, role, event.data);
        });

        const closeOrErrorHandler = () => {
            if (role === 'streamer' && socket === this.streamer) {
                console.log('Streamer disconnected');
                this.streamer = null;
                this.latestOffer = null;
                // Beri tahu semua viewer bahwa stream berhenti
                this.viewers.forEach(v => v.send(JSON.stringify({ type: 'streamer-disconnected' })));
            } else if (role === 'viewer') {
                this.viewers.delete(socket);
                console.log('A viewer disconnected');
            }
        };
        socket.addEventListener('close', closeOrErrorHandler);
        socket.addEventListener('error', closeOrErrorHandler);
    }
    
    handleMessage(sender, role, message) {
        try {
            const signal = JSON.parse(message);

            if (role === 'streamer') {
                if (signal.type === 'offer') {
                    this.latestOffer = signal.data;
                    this.viewers.forEach(v => v.send(message)); // Broadcast offer ke semua viewer
                } else if (signal.type === 'candidate') {
                    this.viewers.forEach(v => v.send(message)); // Broadcast candidate streamer ke semua viewer
                }
            } 
            else if (role === 'viewer') {
                if (signal.type === 'answer' || signal.type === 'candidate') {
                    if (this.streamer) {
                        this.streamer.send(message); // Kirim answer/candidate dari viewer HANYA ke streamer
                    }
                }
            }
        } catch (error) {
            console.error("Failed to handle WebSocket message:", error);
        }
    }
}