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
    // --- Kode BARU yang disarankan ---
if (clientType === 'esp32' && this.esp32Socket) {
  console.log('ESP32 mencoba koneksi baru, sementara koneksi lama (mungkin zombie) masih tercatat. Menutup koneksi lama...');
  // Kirim kode penutupan yang jelas, misal 1012 (service restart) atau 4001 (custom)
  // Ini untuk memberitahu klien lama (jika masih hidup) bahwa ia ditendang.
  this.esp32Socket.close(1012, 'Reconnecting'); 
  
  // Secara paksa bersihkan state, jangan menunggu event 'close'
  this.esp32Socket = null; 
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
          this.esp32Socket.send(JSON.stringify({ event: 'player_disconnected' }));
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