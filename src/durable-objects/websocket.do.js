// File: src/durable-objects/websocket.do.js (VERSI DENGAN BUFFER CANDIDATE)

import { DurableObject } from "cloudflare:workers";

export class WebSocketDO extends DurableObject {
    streamer = null;
    viewer = null; 
    latestOffer = null;
    
    // --- PERUBAHAN 1: Tambahkan buffer untuk menyimpan candidate dari streamer ---
    streamerCandidates = [];

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
            if (this.streamer) this.streamer.close(1000, 'Streamer baru terhubung');
            this.streamer = socket;
            
            // --- PERUBAHAN 2: Reset state saat streamer baru terhubung ---
            this.latestOffer = null;
            this.streamerCandidates = [];

            if (this.viewer) this.viewer.send(JSON.stringify({ type: 'streamer-disconnected' }));
            this.ctx.storage.delete('stream_secret');

        } else { // role === 'viewer'
            if (this.viewer) this.viewer.close(1000, 'Viewer baru terhubung');
            this.viewer = socket;

            // --- PERUBAHAN 3: Kirim offer DAN semua candidate yang sudah dibuffer ---
            if (this.latestOffer) {
                console.log(`[DO ${idMobil}] Mengirimkan offer yang sudah ada ke viewer baru.`);
                socket.send(JSON.stringify({ type: 'offer', data: this.latestOffer }));
                
                console.log(`[DO ${idMobil}] Mengirimkan ${this.streamerCandidates.length} candidate yang dibuffer.`);
                for (const candidate of this.streamerCandidates) {
                    socket.send(JSON.stringify({ type: 'candidate', data: candidate }));
                }
            }
        }

        socket.addEventListener('message', event => this.handleMessage(socket, role, event.data, idMobil));
        
        const closeOrErrorHandler = () => {
            if (role === 'streamer' && socket === this.streamer) {
                this.streamer = null; 
                this.latestOffer = null;
                // --- PERUBAHAN 5: Kosongkan buffer candidate saat streamer disconnect ---
                this.streamerCandidates = [];
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
    try {
        const signal = JSON.parse(message);
        
        if (role === 'streamer') {
            if (signal.type === 'offer') {
                this.latestOffer = signal.data;
            }
            
            if (signal.type === 'candidate') {
                if (this.viewer) {
                    console.log(`[DO ${idMobil}] Candidate dari streamer, VIEWER ADA. Langsung kirim.`);
                    this.viewer.send(message);
                } else {
                    console.log(`[DO ${idMobil}] Candidate dari streamer, VIEWER BELUM ADA. Buffer. Ukuran buffer sekarang: ${this.streamerCandidates.length + 1}`);
                    this.streamerCandidates.push(signal.data);
                }
                return; 
            }

            if (this.viewer) {
                this.viewer.send(message);
            }

        } else if (role === 'viewer') {
            console.log(`[DO ${idMobil}] Menerima sinyal '${signal.type}' dari viewer. Meneruskan ke streamer.`);
            if (this.streamer) {
                this.streamer.send(message);
            }
        }
    } catch (error) {
        console.error(`[DO ${idMobil}] Gagal memproses pesan:`, error);
    }
}