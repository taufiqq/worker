// File: src/durable-objects/websocket.do.js

import { DurableObject } from "cloudflare:workers";

export class WebSocketDO extends DurableObject {
    streamer = null;
    viewers = new Set();
    latestOffer = null;
    idMobil;

    constructor(ctx, env) {
        super(ctx, env);
        // Mendapatkan id_mobil dari nama DO itu sendiri
        this.idMobil = ctx.id.name; 
    }

    async fetch(request) {
        const url = new URL(request.url);

        // Rute internal untuk mengatur secret dari streamer
        if (url.pathname === '/_set_stream_secret') {
            if (request.method !== 'POST') {
                return new Response('Method Not Allowed', { status: 405 });
            }
            const streamSecret = await request.text();
            if (!streamSecret) {
                return new Response('Secret cannot be empty', { status: 400 });
            }
            // Simpan secret ke storage yang persisten untuk DO ini
            await this.ctx.storage.put('stream_secret', streamSecret);
            return new Response('Secret stored', { status: 200 });
        }
        
        // Logika untuk upgrade ke WebSocket
        const upgradeHeader = request.headers.get('Upgrade');
        if (!upgradeHeader || upgradeHeader !== 'websocket') {
            return new Response('Expected Upgrade: websocket', { status: 426 });
        }

        // --- GERBANG OTENTIKASI ---
        const authToken = url.searchParams.get('auth');
        if (!authToken) {
            return new Response('Auth token is required', { status: 401 });
        }

        let role = null;
        
        // Cek apakah ini streamer
        const storedSecret = await this.ctx.storage.get('stream_secret');
        if (storedSecret && authToken === storedSecret) {
            role = 'streamer';
        } else {
            // Jika bukan streamer, cek apakah ini viewer yang valid
            const ps = this.env.DB.prepare('SELECT id_mobil FROM tokens WHERE token = ? AND claimed_by_ip IS NOT NULL');
            const tokenData = await ps.bind(authToken).first();

            // Token valid JIKA ada di DB, sudah diklaim, DAN id_mobil-nya cocok dengan DO ini.
            if (tokenData && tokenData.id_mobil === this.idMobil) {
                role = 'viewer';
            }
        }

        if (!role) {
            // Jika tidak ada peran yang cocok, tolak koneksi
            return new Response('Invalid or expired auth token', { status: 403 });
        }
        // --- AKHIR GERBANG OTENTIKASI ---

        const [client, server] = Object.values(new WebSocketPair());
        this.handleSession(server, role);

        return new Response(null, {
            status: 101,
            webSocket: client,
        });
    }

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