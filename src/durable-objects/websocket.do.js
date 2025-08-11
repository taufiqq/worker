// File: src/durable-objects/websocket.do.js (SOLUSI FINAL & PASTI)

import { DurableObject } from "cloudflare:workers";

export class WebSocketDO extends DurableObject {
    streamer = null;
    viewers = new Set();
    latestOffer = null;
    
    // Kita tidak perlu lagi constructor untuk mengatur idMobil
    constructor(ctx, env) {
        super(ctx, env);
    }

    async fetch(request) {
        const url = new URL(request.url);
        
        // --- PERUBAHAN PALING KRUSIAL ---
        // Ambil ID langsung dari URL yang masuk ke DO. 
        // Abaikan `this.ctx.id.name` karena terbukti tidak bisa diandalkan.
        // URL untuk WebSocket akan berbentuk: /ws/1?auth=...
        // Kita ambil bagian '1' dari path.
        const pathSegments = url.pathname.split('/');
        const idMobil = pathSegments[pathSegments.length - 1]; // Ambil segmen terakhir
        
        console.log(`[DO] Menerima fetch. ID dari URL: ${idMobil}. URL: ${url.pathname}`);

        if (url.pathname === '/_set_stream_secret') {
            console.log(`[DO ${idMobil}] Menangani '/_set_stream_secret'`);
            const streamSecret = await request.text();
            if (!streamSecret) return new Response('Secret tidak boleh kosong', { status: 400 });
            await this.ctx.storage.put('stream_secret', streamSecret);
            return new Response('Secret tersimpan', { status: 200 });
        }
        
        const upgradeHeader = request.headers.get('Upgrade');
        if (!upgradeHeader || upgradeHeader !== 'websocket') {
            return new Response('Diharapkan Upgrade: websocket', { status: 426 });
        }

        const authToken = url.searchParams.get('auth');
        if (!authToken) return new Response('Token autentikasi diperlukan', { status: 401 });

        let role = null;
        const storedSecret = await this.ctx.storage.get('stream_secret');
        
        console.log(`[DO ${idMobil}] Memeriksa token: ${authToken.substring(0,4)}...`);

        if (storedSecret && authToken === storedSecret) {
            role = 'streamer';
        } else {
            const ps = this.env.DB.prepare('SELECT id_mobil FROM tokens WHERE token = ?');
            const tokenData = await ps.bind(authToken).first();
            
            // Gunakan `idMobil` yang kita ambil dari URL untuk perbandingan
            if (tokenData && tokenData.id_mobil.toString() === idMobil) {
                role = 'viewer';
            }
        }

        if (!role) {
            console.log(`[DO ${idMobil}] AUTH GAGAL. Peran tidak ditemukan.`);
            return new Response('Token autentikasi tidak valid', { status: 403 });
        }
        
        console.log(`[DO ${idMobil}] AUTH BERHASIL. Peran: ${role}`);
        const [client, server] = Object.values(new WebSocketPair());
        this.handleSession(server, role, idMobil); // Teruskan idMobil ke handleSession
        return new Response(null, { status: 101, webSocket: client });
    }

    handleSession(socket, role, idMobil) { // Terima idMobil di sini
        socket.accept();
        console.log(`[DO ${idMobil}] Koneksi diterima. Peran: ${role}`);

        if (role === 'streamer') {
            if (this.streamer) this.streamer.close(1000, 'Streamer baru terhubung');
            this.streamer = socket;
            this.ctx.storage.delete('stream_secret');
        } else {
            this.viewers.add(socket);
            if (this.latestOffer) {
                socket.send(JSON.stringify({ type: 'offer', data: this.latestOffer }));
            }
        }

        socket.addEventListener('message', event => this.handleMessage(socket, role, event.data, idMobil)); // Teruskan
        
        const closeOrErrorHandler = () => {
            if (role === 'streamer' && socket === this.streamer) {
                this.streamer = null; this.latestOffer = null;
                this.viewers.forEach(v => v.send(JSON.stringify({ type: 'streamer-disconnected' })));
            } else if (role === 'viewer') {
                this.viewers.delete(socket);
            }
            console.log(`[DO ${idMobil}] Koneksi ditutup. Peran: ${role}`);
        };
        socket.addEventListener('close', closeOrErrorHandler);
        socket.addEventListener('error', closeOrErrorHandler);
    }
    
    handleMessage(senderSocket, role, message, idMobil) { // Terima idMobil di sini
        try {
            const signal = JSON.parse(message);
            if (role === 'streamer') {
                if (signal.type === 'offer') this.latestOffer = signal.data;
                this.viewers.forEach(v => v.send(message));
            } else if (role === 'viewer') {
                if (this.streamer) this.streamer.send(message);
            }
        } catch (error) {
            console.error(`[DO ${idMobil}] Gagal memproses pesan:`, error);
        }
    }
}