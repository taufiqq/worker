// src/webrtc.do.js

export class WebRTCDurableObject {
  constructor(state, env) {
    this.state = state;
    // Gunakan array untuk menyimpan koneksi WebSocket. Sederhana dan efektif.
    this.sessions = [];
  }

  async fetch(request) {
    // Pastikan ini adalah permintaan upgrade WebSocket
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    // Membuat sepasang WebSocket, satu untuk server, satu untuk klien
    const [client, server] = Object.values(new WebSocketPair());

    // Menangani koneksi di sisi server
    this.handleSession(server);

    // Mengembalikan sisi klien ke browser untuk menyelesaikan koneksi
    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  handleSession(socket) {
    socket.accept();
    this.sessions.push(socket);

    // Saat menerima pesan, teruskan ke SEMUA sesi lain.
    socket.addEventListener('message', (event) => {
      this.sessions.forEach((session) => {
        if (session !== socket) { // Jangan kirim kembali ke pengirim
          session.send(event.data);
        }
      });
    });

    // Saat koneksi ditutup, hapus dari daftar sesi.
    socket.addEventListener('close', () => {
      this.sessions = this.sessions.filter((session) => session !== socket);
    });

    socket.addEventListener('error', (err) => {
      console.error('WebSocket error:', err);
      this.sessions = this.sessions.filter((session) => session !== socket);
    });
  }
}