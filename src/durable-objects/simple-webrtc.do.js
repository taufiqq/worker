// --- START OF FILE src/durable-objects/simple-webrtc.do.js ---

import { DurableObject } from "cloudflare:workers";

// Durable Object ini hanya untuk contoh WebRTC sederhana.
// Logikanya sama dengan versi "Simpan Semuanya", karena ini yang paling stabil.
export class SimpleWebRTC_DO extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env);
        this.sessions = new Map(); // { sender: WebSocket | null, receiver: WebSocket | null, messages: string[] }
    }
    
    // Helper untuk mendapatkan atau membuat sesi baru
    getSession(sessionId) {
        if (!this.sessions.has(sessionId)) {
            this.sessions.set(sessionId, { sender: null, receiver: null, senderMailbox: [], receiverMailbox: [] });
        }
        return this.sessions.get(sessionId);
    }

    async fetch(request) {
        const url = new URL(request.url);
        const sessionId = url.searchParams.get('sessionId');
        const role = url.searchParams.get('role'); // 'sender' atau 'receiver'

        if (!sessionId || !role) {
            return new Response("sessionId and role are required", { status: 400 });
        }

        const upgradeHeader = request.headers.get('Upgrade');
        if (!upgradeHeader || upgradeHeader !== 'websocket') {
            return new Response('Expected Upgrade: websocket', { status: 426 });
        }

        const [client, server] = Object.values(new WebSocketPair());
        this.handleWebSocket(server, sessionId, role);
        return new Response(null, { status: 101, webSocket: client });
    }
    
    handleWebSocket(socket, sessionId, role) {
        socket.accept();
        const session = this.getSession(sessionId);

        console.log(`[DO Simple] Koneksi diterima untuk sesi ${sessionId}, peran: ${role}`);
        
        if (role === 'sender') {
            // Reset sesi jika ada sender baru
            session.sender = socket;
            session.senderMailbox = [];
            session.receiverMailbox = [];
            if (session.receiver) session.receiver.close(1012, "Sender baru terhubung, sesi direset.");
            
            // Kirim pesan yang mungkin sudah dikirim receiver
            this.flushMailbox(session.receiverMailbox, session.sender, 'receiver');
            
        } else { // role === 'receiver'
            session.receiver = socket;
             // Kirim pesan yang sudah menunggu dari sender
            this.flushMailbox(session.senderMailbox, session.receiver, 'sender');
        }

        socket.addEventListener('message', event => {
            const recipient = role === 'sender' ? session.receiver : session.sender;
            const mailbox = role === 'sender' ? session.senderMailbox : session.receiverMailbox;

            if (recipient) {
                recipient.send(event.data);
            } else {
                console.log(`[DO Simple] Penerima belum ada. Menyimpan pesan dari ${role}.`);
                mailbox.push(event.data);
            }
        });
        
        const closeHandler = () => {
             if (role === 'sender' && socket === session.sender) {
                console.log(`[DO Simple] Sender untuk sesi ${sessionId} terputus. Sesi dibersihkan.`);
                if (session.receiver) session.receiver.close(1012, "Sender terputus.");
                this.sessions.delete(sessionId);
             } else if (role === 'receiver' && socket === session.receiver) {
                console.log(`[DO Simple] Receiver untuk sesi ${sessionId} terputus.`);
                session.receiver = null;
             }
        };
        socket.addEventListener('close', closeHandler);
        socket.addEventListener('error', closeHandler);
    }
    
    flushMailbox(mailbox, recipient, senderRole) {
        if (recipient && mailbox.length > 0) {
            console.log(`[DO Simple] Mengirim ${mailbox.length} pesan tersimpan dari ${senderRole}.`);
            for (const msg of mailbox) {
                recipient.send(msg);
            }
            mailbox.length = 0;
        }
    }
}