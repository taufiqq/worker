// File: src/durable-objects/websocket.do.js
// VERSI PALING TANGGUH - "Simpan Semuanya"

import { DurableObject } from "cloudflare:workers";

export class WebSocketDO extends DurableObject {
    // State disimpan dalam satu objek agar mudah di-reset
    session = this.resetSession();

    // Fungsi helper untuk mereset state ke kondisi awal
    resetSession() {
        return {
            streamer: null,        // Koneksi WebSocket streamer
            viewer: null,          // Koneksi WebSocket viewer
            streamerMessages: [],  // "Kotak surat" untuk pesan DARI streamer KE viewer
            viewerMessages: [],    // "Kotak surat" untuk pesan DARI viewer KE streamer
        };
    }

    constructor(ctx, env) {
        super(ctx, env);
    }

    async fetch(request) {
        // Logika fetch tidak perlu diubah, sudah benar.
        const url = new URL(request.url);
        const pathSegments = url.pathname.split('/');
        const idMobil = pathSegments[pathSegments.length - 1];

        if (url.pathname === '/_set_stream_secret') {
            await this.ctx.storage.put('stream_secret', await request.text());
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
            return new Response('Token autentikasi tidak valid', { status: 403 });
        }
        
        const [client, server] = Object.values(new WebSocketPair());
        this.handleSession(server, role, idMobil);
        return new Response(null, { status: 101, webSocket: client });
    }

    handleSession(socket, role, idMobil) {
        socket.accept();
        console.log(`[DO ${idMobil}] Koneksi diterima. Peran: ${role}`);

        if (role === 'streamer') {
            // Jika ada streamer lama, putuskan koneksinya.
            if (this.session.streamer) {
                this.session.streamer.close(1012, 'Sesi diambil alih oleh streamer baru.');
            }
            // **RESET TOTAL SEMUA STATE SAAT STREAMER BARU DATANG**
            console.log(`[DO ${idMobil}] STREAMER BARU TERHUBUNG. Mereset seluruh state sesi.`);
            this.session = this.resetSession();
            this.session.streamer = socket;
            
            // Hapus secret setelah digunakan
            this.ctx.storage.delete('stream_secret');

            // Coba kirim pesan yang mungkin sudah dikirim viewer duluan
            this.flushMessages(this.session.viewerMessages, this.session.streamer, 'viewer', idMobil);

        } else { // role === 'viewer'
            // Jika ada viewer lama, putuskan koneksinya.
            if (this.session.viewer) {
                this.session.viewer.close(1012, 'Sesi diambil alih oleh viewer baru.');
            }
            this.session.viewer = socket;
            this.session.viewerMessages = []; // Kosongkan kotak surat viewer lama

            // Kirim semua pesan yang sudah menumpuk dari streamer
            this.flushMessages(this.session.streamerMessages, this.session.viewer, 'streamer', idMobil);
        }

        socket.addEventListener('message', event => {
            console.log(`[DO ${idMobil}] Menerima pesan dari: ${role}`);
            const recipient = (role === 'streamer') ? this.session.viewer : this.session.streamer;
            const mailbox = (role === 'streamer') ? this.session.streamerMessages : this.session.viewerMessages;

            // Jika penerima sudah ada, langsung kirim.
            if (recipient) {
                recipient.send(event.data);
            } else {
                // Jika penerima belum ada, SIMPAN di kotak surat.
                console.log(`[DO ${idMobil}] Penerima (${role === 'streamer' ? 'viewer' : 'streamer'}) belum ada. MENYIMPAN PESAN.`);
                mailbox.push(event.data);
            }
        });
        
        const closeOrErrorHandler = () => {
            if (role === 'streamer' && socket === this.session.streamer) {
                console.log(`[DO ${idMobil}] Streamer AKTIF terputus.`);
                // Saat streamer putus, sesi dianggap berakhir. Reset total.
                this.session = this.resetSession();
                // Beri tahu viewer (jika masih terhubung) bahwa sesi berakhir.
                if (this.session.viewer) {
                   this.session.viewer.send(JSON.stringify({ type: 'streamer-disconnected' }));
                }
            } else if (role === 'viewer' && socket === this.session.viewer) {
                console.log(`[DO ${idMobil}] Viewer AKTIF terputus.`);
                this.session.viewer = null;
                this.session.viewerMessages = []; // Kosongkan kotak suratnya
            }
        };
        socket.addEventListener('close', closeOrErrorHandler);
        socket.addEventListener('error', closeOrErrorHandler);
    }
    
    // Fungsi untuk "mengosongkan" kotak surat dan mengirim semua isinya
    flushMessages(mailbox, recipient, senderRole, idMobil) {
        if (recipient && mailbox.length > 0) {
            console.log(`[DO ${idMobil}] Mengirim ${mailbox.length} pesan tersimpan dari ${senderRole} ke penerima.`);
            for (const msg of mailbox) {
                recipient.send(msg);
            }
            mailbox.length = 0; // Kosongkan array setelah dikirim
        }
    }
}