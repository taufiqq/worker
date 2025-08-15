// src/durable-objects/VideoSession.js

export class VideoSession {
    constructor(state, env) {
        this.state = state;
        this.streamer = null;
        this.viewer = null;
    }

    async fetch(request) {
        // Ambil peran yang dikirim oleh worker utama melalui header
        const role = request.headers.get('X-Client-Role');

        if (!role || (role !== 'streamer' && role !== 'viewer')) {
            return new Response('Peran klien tidak valid atau tidak disediakan.', { status: 400 });
        }
        
        const upgradeHeader = request.headers.get('Upgrade');
        if (!upgradeHeader || upgradeHeader !== 'websocket') {
            return new Response('Expected Upgrade: websocket', { status: 426 });
        }

        const [client, server] = Object.values(new WebSocketPair());
        
        // Teruskan peran yang sudah divalidasi ke handler
        await this.handleSession(server, role);

        return new Response(null, {
            status: 101,
            webSocket: client,
        });
    }

    async handleSession(ws, role) { // Terima 'role' sebagai argumen
        ws.accept();

        // LOGIKA PERAN BARU: Tetapkan koneksi berdasarkan peran yang diberikan
        if (role === 'streamer') {
            if (this.streamer) {
                // Tolak streamer kedua
                console.log(`[DO ${this.state.id}] Streamer connection rejected, already connected.`);
                ws.close(1013, 'Streamer already connected');
                return;
            }
            this.streamer = ws;
            console.log(`[DO ${this.state.id}] Streamer connected.`);
        } else if (role === 'viewer') {
            if (this.viewer) {
                // Tolak viewer kedua (untuk saat ini, bisa dikembangkan untuk multi-viewer)
                console.log(`[DO ${this.state.id}] Viewer connection rejected, already connected.`);
                ws.close(1013, 'Viewer already connected');
                return;
            }
            this.viewer = ws;
            console.log(`[DO ${this.state.id}] Viewer connected.`);
        }

        ws.addEventListener('message', event => {
            try {
                // Logika relay pesan tidak berubah
                if (role === 'streamer' && this.viewer) {
                    this.viewer.send(event.data);
                } else if (role === 'viewer' && this.streamer) {
                    this.streamer.send(event.data);
                }
            } catch (error) {
                console.error(`[DO ${this.state.id}] Failed to relay message:`, error);
            }
        });
        
        // Logika event 'close' juga tidak berubah secara signifikan
        ws.addEventListener('close', event => {
            console.log(`[DO ${this.state.id}] ${role} disconnected. Code: ${event.code}, Reason: ${event.reason}`);
            if (role === 'streamer') {
                this.streamer = null;
                if (this.viewer) {
                    this.viewer.close(1011, 'Streamer disconnected');
                    this.viewer = null;
                }
            } else if (role === 'viewer') {
                this.viewer = null;
                if (this.streamer) {
                   this.streamer.send(JSON.stringify({ type: 'viewer-disconnected' }));
                }
            }
        });
    }
}