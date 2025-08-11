// File: src/durable-objects/websocket.do.js (VERSI DIPERBAIKI & LEBIH AMAN)

import { DurableObject } from "cloudflare:workers";

export class WebSocketDO extends DurableObject {
    streamer = null;
    viewers = new Set();
    latestOffer = null;
    idMobil;

    constructor(ctx, env) {
        super(ctx, env);
        this.idMobil = this.ctx.id.name;
    }

    async fetch(request) {
        const url = new URL(request.url);
        console.log(`[DO ${this.idMobil}] Menerima fetch untuk: ${url.pathname}`);

        // Rute untuk mengatur secret, hanya bisa diakses dari dalam worker
        if (url.pathname === '/_set_stream_secret') {
            console.log(`[DO ${this.idMobil}] Menangani '/_set_stream_secret'`);
            const streamSecret = await request.text();
            if (!streamSecret) {
                return new Response('Secret tidak boleh kosong', { status: 400 });
            }
            await this.ctx.storage.put('stream_secret', streamSecret);
            console.log(`[DO ${this.idMobil}] BERHASIL: Stream secret disimpan.`);
            return new Response('Secret tersimpan', { status: 200 });
        }
        
        // Pastikan ini adalah permintaan upgrade WebSocket
        const upgradeHeader = request.headers.get('Upgrade');
        if (!upgradeHeader || upgradeHeader !== 'websocket') {
            return new Response('Diharapkan Upgrade: websocket', { status: 426 });
        }

        console.log(`[DO ${this.idMobil}] Menangani upgrade WebSocket...`);
        const authToken = url.searchParams.get('auth');
        if (!authToken) {
            return new Response('Token autentikasi diperlukan', { status: 401 });
        }

        let role = null;
        
        // --- LOGIKA AUTENTIKASI YANG DIPERBAIKI ---
        const storedSecret = await this.ctx.storage.get('stream_secret');
        
        // Log untuk debugging
        console.log(`[DO ${this.idMobil}] Token dari klien: ${authToken.substring(0, 8)}...`);
        console.log(`[DO ${this.idMobil}] Secret dari storage: ${storedSecret ? storedSecret.substring(0, 8) + '...' : 'null'}`);

        // Cek #1: Apakah ini Streamer?
        if (storedSecret && authToken === storedSecret) {
            role = 'streamer';
            console.log(`[DO ${this.idMobil}] AUTH_BERHASIL: Peran adalah 'streamer'.`);
        } 
        // Cek #2: Jika bukan streamer, apakah ini Viewer yang valid?
        else {
            try {
                const ps = this.env.DB.prepare('SELECT id_mobil FROM tokens WHERE token = ?');
                const tokenData = await ps.bind(authToken).first();

                if (tokenData && tokenData.id_mobil.toString() === this.idMobil) {
                    role = 'viewer';
                    console.log(`[DO ${this.idMobil}] AUTH_BERHASIL: Peran adalah 'viewer'.`);
                } else {
                    console.log(`[DO ${this.idMobil}] AUTH_GAGAL: Token viewer tidak valid atau tidak cocok dengan id_mobil.`);
                }
            } catch (dbError) {
                console.error(`[DO ${this.idMobil}] Terjadi error saat query DB untuk autentikasi viewer:`, dbError);
                return new Response('Server error saat verifikasi token', { status: 500 });
            }
        }

        // Jika setelah semua pengecekan `role` masih null, tolak koneksi.
        if (!role) {
            console.error(`[DO ${this.idMobil}] AUTH_FINAL_GAGAL: Tidak ada peran yang valid untuk token ${authToken.substring(0, 8)}... Menolak koneksi.`);
            // Mengembalikan 403 akan menyebabkan error 1006 di klien
            return new Response('Token autentikasi tidak valid', { status: 403 });
        }
        
        // Jika autentikasi berhasil, lanjutkan dengan upgrade WebSocket
        const [client, server] = Object.values(new WebSocketPair());
        this.handleSession(server, role);
        return new Response(null, { status: 101, webSocket: client });
    }

    // Metode `handleSession` dan `handleMessage` tetap sama seperti yang Anda miliki
    handleSession(socket, role) {
        socket.accept();
        console.log(`[DO ${this.idMobil}] Koneksi diterima dengan peran: ${role}`);

        if (role === 'streamer') {
            if (this.streamer) this.streamer.close(1000, 'Streamer baru terhubung');
            this.streamer = socket;
            // Saat streamer terhubung, kita tidak lagi butuh secret lama. 
            // Ini mencegah viewer lama dengan secret lama bisa re-connect.
            this.ctx.storage.delete('stream_secret'); 
        } else { // role === 'viewer'
            this.viewers.add(socket);
            if (this.latestOffer) {
                console.log(`[DO ${this.idMobil}] Mengirim offer yang sudah ada ke viewer baru.`);
                socket.send(JSON.stringify({ type: 'offer', data: this.latestOffer }));
            } else {
                console.log(`[DO ${this.idMobil}] Viewer terhubung, tapi belum ada offer dari streamer.`);
            }
        }

        socket.addEventListener('message', event => this.handleMessage(socket, role, event.data));
        
        const closeOrErrorHandler = () => {
            if (role === 'streamer' && socket === this.streamer) {
                console.log(`[DO ${this.idMobil}] Streamer terputus.`);
                this.streamer = null; 
                this.latestOffer = null;
                this.viewers.forEach(v => v.send(JSON.stringify({ type: 'streamer-disconnected' })));
            } else if (role === 'viewer') {
                console.log(`[DO ${this.idMobil}] Seorang viewer terputus.`);
                this.viewers.delete(socket);
            }
        };
        socket.addEventListener('close', closeOrErrorHandler);
        socket.addEventListener('error', closeOrErrorHandler);
    }
    
    handleMessage(senderSocket, role, message) {
        try {
            const signal = JSON.parse(message);
            // Logika broadcast pesan tetap sama
            if (role === 'streamer') {
                if (signal.type === 'offer') this.latestOffer = signal.data;
                this.viewers.forEach(v => v.send(message));
            } else if (role === 'viewer') {
                if (this.streamer) this.streamer.send(message);
            }
        } catch (error) {
            console.error(`[DO ${this.idMobil}] Gagal memproses pesan WebSocket:`, error);
        }
    }
}