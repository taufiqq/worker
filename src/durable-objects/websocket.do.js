// File: src/durable-objects/websocket.do.js (VERSI 1-ke-1 YANG JAUH LEBIH STABIL)

import { DurableObject } from "cloudflare:workers";

export class WebSocketDO extends DurableObject {
    // --- PERUBAHAN 1: Ganti `viewers` dengan `viewer` tunggal ---
    streamer = null;
    viewer = null; 
    latestOffer = null;
    
    constructor(ctx, env) {
        super(ctx, env);
    }

    async fetch(request) {
        // Logika fetch tidak perlu diubah, sudah benar.
        const url = new URL(request.url);
        const pathSegments = url.pathname.split('/');
        const idMobil = pathSegments[pathSegments.length - 1];
        
        console.log(`[DO ${idMobil}] Menerima fetch. URL: ${url.pathname}`);

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
        
        if (storedSecret && authToken === storedSecret) {
            role = 'streamer';
        } else {
            const ps = this.env.DB.prepare('SELECT id_mobil FROM tokens WHERE token = ?');
            const tokenData = await ps.bind(authToken).first();
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
        this.handleSession(server, role, idMobil);
        return new Response(null, { status: 101, webSocket: client });
    }

    handleSession(socket, role, idMobil) {
        socket.accept();
        console.log(`[DO ${idMobil}] Koneksi diterima. Peran: ${role}`);

        if (role === 'streamer') {
            // Jika ada streamer lama, putuskan koneksinya.
            if (this.streamer) this.streamer.close(1000, 'Streamer baru terhubung');
            this.streamer = socket;
            
            // Beri tahu viewer (jika ada) bahwa streamer terputus (untuk reset)
            if (this.viewer) this.viewer.send(JSON.stringify({ type: 'streamer-disconnected' }));

            // Hapus secret setelah digunakan
            this.ctx.storage.delete('stream_secret');

        } else { // role === 'viewer'
            // --- PERUBAHAN 2: Logika untuk viewer tunggal ---
            // Jika ada viewer lama, putuskan koneksinya. Hanya satu yang boleh nonton.
            if (this.viewer) this.viewer.close(1000, 'Viewer baru terhubung');
            this.viewer = socket;

            // Jika streamer sudah mengirim offer, langsung kirimkan ke viewer baru ini.
            if (this.latestOffer) {
                console.log(`[DO ${idMobil}] Mengirimkan offer yang sudah ada ke viewer baru.`);
                socket.send(JSON.stringify({ type: 'offer', data: this.latestOffer }));
            }
        }

        socket.addEventListener('message', event => this.handleMessage(socket, role, event.data, idMobil));
        
        const closeOrErrorHandler = () => {
            if (role === 'streamer' && socket === this.streamer) {
                this.streamer = null; 
                this.latestOffer = null;
                // Beri tahu viewer bahwa streamer telah terputus
                if (this.viewer) {
                    this.viewer.send(JSON.stringify({ type: 'streamer-disconnected' }));
                }
            } else if (role === 'viewer' && socket === this.viewer) {
                this.viewer = null;
            }
            console.log(`[DO ${idMobil}] Koneksi ditutup. Peran: ${role}`);
        };
        socket.addEventListener('close', closeOrErrorHandler);
        socket.addEventListener('error', closeOrErrorHandler);
    }
    
    handleMessage(senderSocket, role, message, idMobil) {
        // --- PERUBAHAN 3: Logika pengiriman pesan yang jauh lebih sederhana ---
        try {
            const signal = JSON.parse(message);
            
            if (role === 'streamer') {
                // Pesan dari Streamer (offer, candidate) HANYA untuk Viewer
                if (signal.type === 'offer') {
                    this.latestOffer = signal.data;
                }
                if (this.viewer) {
                    this.viewer.send(message);
                }
            } else if (role === 'viewer') {
                // Pesan dari Viewer (answer, candidate) HANYA untuk Streamer
                if (this.streamer) {
                    this.streamer.send(message);
                }
            }
        } catch (error) {
            console.error(`[DO ${idMobil}] Gagal memproses pesan:`, error);
        }
    }
}