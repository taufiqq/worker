// src/durable-objects/VideoSession.js

export class VideoSession {
    constructor(state, env) {
        this.state = state;
        // Kita akan menyimpan koneksi WebSocket di memori, bukan di storage
        this.streamer = null;
        this.viewer = null;
    }

    // Metode fetch dipanggil saat ada permintaan ke Durable Object ini
    async fetch(request) {
        // Harapkan permintaan untuk upgrade ke WebSocket
        const upgradeHeader = request.headers.get('Upgrade');
        if (!upgradeHeader || upgradeHeader !== 'websocket') {
            return new Response('Expected Upgrade: websocket', { status: 426 });
        }

        const [client, server] = Object.values(new WebSocketPair());
        
        // Mulai menangani koneksi WebSocket di sisi server
        await this.handleSession(server);

        // Kembalikan sisi klien dari WebSocket ke runtime
        return new Response(null, {
            status: 101,
            webSocket: client,
        });
    }

    async handleSession(ws) {
        // Terima koneksi
        ws.accept();

        // Tentukan peran koneksi: streamer pertama, lalu viewer
        let role;
        if (!this.streamer) {
            role = 'streamer';
            this.streamer = ws;
            console.log(`[DO ${this.state.id}] Streamer connected.`);
        } else if (!this.viewer) {
            role = 'viewer';
            this.viewer = ws;
            console.log(`[DO ${this.state.id}] Viewer connected.`);
        } else {
            // Sudah ada streamer dan viewer, tolak koneksi baru
            console.log(`[DO ${this.state.id}] Connection rejected, session full.`);
            ws.close(1013, 'Session is full');
            return;
        }

        // Tambahkan event listener untuk pesan dan penutupan
        ws.addEventListener('message', event => {
            // Relay pesan ke pihak lain
            try {
                if (role === 'streamer' && this.viewer) {
                    this.viewer.send(event.data);
                } else if (role === 'viewer' && this.streamer) {
                    this.streamer.send(event.data);
                }
            } catch (error) {
                console.error(`[DO ${this.state.id}] Failed to relay message:`, error);
            }
        });
        
        ws.addEventListener('close', event => {
            console.log(`[DO ${this.state.id}] ${role} disconnected. Code: ${event.code}, Reason: ${event.reason}`);
            if (role === 'streamer') {
                this.streamer = null;
                // Beri tahu viewer bahwa streamer terputus
                if (this.viewer) {
                    this.viewer.close(1011, 'Streamer disconnected');
                    this.viewer = null;
                }
            } else if (role === 'viewer') {
                this.viewer = null;
                // Beri tahu streamer bahwa viewer terputus agar bisa menerima koneksi baru
                if (this.streamer) {
                   this.streamer.send(JSON.stringify({ type: 'viewer-disconnected' }));
                }
            }
        });
    }
}