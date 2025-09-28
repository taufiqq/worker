// src/durable-objects/CarSession.js

export class CarSession {
  constructor(state, env) {
    this.state = state;
    this.pemainSocket = null;
    this.esp32Socket = null;
  }

  async fetch(request) {
    // TAMBAHAN: Logika untuk menangani perintah 'kick'
    if (request.method === 'POST') {
      const url = new URL(request.url);
      if (url.pathname === '/kick') {
        console.log(`Menerima sinyal kick. Menutup koneksi...`);
        // Tutup koneksi dengan kode khusus (misal 4000) agar klien tahu ini disengaja
        if (this.pemainSocket) {
          this.pemainSocket.close(4000, 'session_revoked');
        }
        return new Response('Koneksi telah ditutup.', { status: 200 });
      }
    }

    // --- Logika yang sudah ada untuk upgrade WebSocket ---
    const url = new URL(request.url);
    const clientType = url.searchParams.get('p');

    if (clientType !== 'pemain' && clientType !== 'esp32') {
      return new Response('Query parameter "p" harus "pemain" atau "esp32"', { status: 400 });
    }

    if (clientType === 'pemain' && this.pemainSocket) {
      return new Response('Pemain sudah terhubung ke sesi ini.', { status: 403 });
    }
    if (clientType === 'esp32' && this.esp32Socket) {
//      return new Response('ESP32 sudah terhubung ke sesi ini.', { status: 403 });
    }

    const { 0: client, 1: server } = new WebSocketPair();

    if (clientType === 'pemain') {
      this.pemainSocket = server;
    } else {
      this.esp32Socket = server;
    }

    this.handleSocketEvents(server, clientType);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  handleSocketEvents(socket, clientType) {
    socket.accept();

    socket.addEventListener('message', (event) => {
      console.log(`Pesan diterima dari ${clientType}: ${event.data}`);
      if (clientType === 'esp32' && event.data == 'p'){
        this.esp32Socket.send('p');
      } else
      if (clientType === 'pemain' && this.esp32Socket) {
        this.esp32Socket.send(event.data);
      } else if (clientType === 'esp32' && this.pemainSocket) {
        this.pemainSocket.send(event.data);
      }
    });

    const closeOrErrorHandler = (event) => {
      // Tidak ada perubahan signifikan di sini, logika pembersihan tetap berjalan
      console.log(`Koneksi ${clientType} ditutup. Code: ${event.code}, Reason: ${event.reason}`);
      if (clientType === 'pemain') {
        this.pemainSocket = null;
        if (this.esp32Socket) {
          this.esp32Socket.send('disconnect');
        }
      } else {
        this.esp32Socket = null;
        if (this.pemainSocket) {
          this.pemainSocket.send(JSON.stringify({ event: 'esp32_disconnected' }));
        }
      }
    };

    socket.addEventListener('close', closeOrErrorHandler);
    socket.addEventListener('error', closeOrErrorHandler);
  }
}