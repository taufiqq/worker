// src/durable-objects/VideoSession.js
// Salin dan ganti seluruh isi file ini.
// Versi ini sudah menggabungkan perbaikan sebelumnya dan perbaikan baru.

export class VideoSession {
    constructor(state, env) {
        this.state = state;
        this.streamer = null;
        this.viewer = null;
    }

    async fetch(request) {
        const role = request.headers.get('X-Client-Role');

        if (!role || (role !== 'streamer' && role !== 'viewer')) {
            return new Response('Peran klien tidak valid atau tidak disediakan.', { status: 400 });
        }
        
        const upgradeHeader = request.headers.get('Upgrade');
        if (!upgradeHeader || upgradeHeader !== 'websocket') {
            return new Response('Expected Upgrade: websocket', { status: 426 });
        }

        const [client, server] = Object.values(new WebSocketPair());
        
        await this.handleSession(server, role);

        return new Response(null, {
            status: 101,
            webSocket: client,
        });
    }

    async handleSession(ws, role) {
        ws.accept();

        if (role === 'streamer') {
            if (this.streamer) {
                console.log(`[DO ${this.state.id}] Streamer is reconnecting. Replacing old connection.`);
                this.streamer.close(1012, 'Reconnecting'); 
            }
            this.streamer = ws;
            console.log(`[DO ${this.state.id}] Streamer connected.`);
            
            // LOGIKA BARU: Jika streamer terhubung dan viewer sudah menunggu,
            // suruh streamer untuk memulai koneksi.
            if (this.viewer) {
                console.log(`[DO ${this.state.id}] Viewer was waiting. Telling streamer to initiate WebRTC.`);
                this.streamer.send(JSON.stringify({ type: 'initiate-webrtc' }));
            }

        } else if (role === 'viewer') {
            if (this.viewer) {
                console.log(`[DO ${this.state.id}] Viewer is reconnecting. Replacing old connection.`);
                this.viewer.close(1012, 'Reconnecting');
            }
            this.viewer = ws;
            console.log(`[DO ${this.state.id}] Viewer connected.`);

            // LOGIKA BARU: Jika viewer terhubung dan streamer sudah siap,
            // suruh streamer untuk memulai koneksi.
            if (this.streamer) {
                console.log(`[DO ${this.state.id}] Streamer is ready. Telling streamer to initiate WebRTC.`);
                this.streamer.send(JSON.stringify({ type: 'initiate-webrtc' }));
            }
        }

        ws.addEventListener('message', event => {
            try {
                // Relay logic tetap sama
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
            
            if (role === 'streamer' && this.streamer === ws) {
                this.streamer = null;
                if (this.viewer) {
                    this.viewer.close(1011, 'Streamer disconnected');
                    this.viewer = null;
                }
            } else if (role === 'viewer' && this.viewer === ws) {
                this.viewer = null;
                if (this.streamer) {
                   this.streamer.send(JSON.stringify({ type: 'viewer-disconnected' }));
                }
            }
        });
    }
}