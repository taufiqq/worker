// src/durable-objects/VideoSession.js

export class VideoSession {
    constructor(state, env) {
        this.state = state;
        this.streamer = null;
        this.viewer = null;
    }

    // ... metode fetch tidak berubah ...
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


    async handleSession(ws, role) {
        ws.accept();

        if (role === 'streamer') {
            // --- PERUBAHAN UTAMA DI SINI ---
            if (this.streamer) {
                // Jika sudah ada streamer, anggap ini rekoneksi.
                // Tutup koneksi lama dengan baik.
                console.log(`[DO ${this.state.id}] Streamer is reconnecting. Replacing old connection.`);
                this.streamer.close(1012, 'Reconnecting'); 
            }
            this.streamer = ws; // Tetapkan koneksi BARU
            console.log(`[DO ${this.state.id}] Streamer connected.`);
        } else if (role === 'viewer') {
            // --- PERUBAHAN UTAMA DI SINI ---
            if (this.viewer) {
                // Jika sudah ada viewer, anggap ini rekoneksi.
                console.log(`[DO ${this.state.id}] Viewer is reconnecting. Replacing old connection.`);
                this.viewer.close(1012, 'Reconnecting');
            }
            this.viewer = ws; // Tetapkan koneksi BARU
            console.log(`[DO ${this.state.id}] Viewer connected.`);
        }

        ws.addEventListener('message', event => {
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
            
            // --- PENYEMPURNAAN PENTING ---
            // Pastikan kita hanya membersihkan state jika koneksi yang ditutup
            // adalah koneksi yang sedang aktif, bukan koneksi lama yang sudah diganti.
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