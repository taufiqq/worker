// src/durable-objects/CarSession.js

export class CarSession {
  constructor(state, env) {
    this.state = state;
    // Kita akan menyimpan objek WebSocket untuk setiap tipe klien
    this.pemainSocket = null;
    this.esp32Socket = null;
  }

  // Method ini dipanggil saat ada request (termasuk upgrade WebSocket)
  async fetch(request) {
    const url = new URL(request.url);
    const clientType = url.searchParams.get('p'); // Mengambil query parameter 'p'

    // Validasi tipe klien
    if (clientType !== 'pemain' && clientType !== 'esp32') {
      return new Response('Query parameter "p" harus "pemain" atau "esp32"', { status: 400 });
    }

    // Cek apakah klien dengan tipe yang sama sudah terhubung
    if (clientType === 'pemain' && this.pemainSocket) {
      return new Response('Pemain sudah terhubung ke sesi ini.', { status: 403 }); // 403 Forbidden
    }
    if (clientType === 'esp32' && this.esp32Socket) {
      return new Response('ESP32 sudah terhubung ke sesi ini.', { status: 403 }); // 403 Forbidden
    }

    // Jika semua validasi lolos, kita buat WebSocket pair
    const { 0: client, 1: server } = new WebSocketPair();

    // Simpan socket 'server' di dalam Durable Object berdasarkan tipenya
    if (clientType === 'pemain') {
      this.pemainSocket = server;
    } else {
      this.esp32Socket = server;
    }

    // Panggil method untuk menangani event dari socket ini
    this.handleSocketEvents(server, clientType);

    // Kembalikan response 101 Switching Protocols dengan socket 'client'
    // Cloudflare akan otomatis menyelesaikan handshake WebSocket
    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  // Method untuk menangani event message, close, dan error
  handleSocketEvents(socket, clientType) {
    // Kita harus memanggil accept() agar koneksi WebSocket dimulai
    socket.accept();

    // Event handler untuk pesan masuk
    socket.addEventListener('message', (event) => {
      console.log(`Pesan diterima dari ${clientType}: ${event.data}`);

      // Teruskan pesan ke klien yang lain
      if (clientType === 'pemain' && this.esp32Socket) {
        // Dari pemain -> ke ESP32
        this.esp32Socket.send(event.data);
      } else if (clientType === 'esp32' && this.pemainSocket) {
        // Dari ESP32 -> ke pemain
        this.pemainSocket.send(event.data);
      }
    });

    // Event handler untuk koneksi ditutup atau error
    const closeOrErrorHandler = (event) => {
      console.log(`Koneksi ${clientType} ditutup.`);
      // Hapus referensi socket agar slotnya kosong lagi
      if (clientType === 'pemain') {
        this.pemainSocket = null;
        // Opsional: Beri tahu ESP32 bahwa pemain telah disconnected
        if (this.esp32Socket) {
          this.esp32Socket.send(JSON.stringify({ event: 'player_disconnected' }));
        }
      } else { // esp32
        this.esp32Socket = null;
        // Opsional: Beri tahu pemain bahwa ESP32 telah disconnected
        if (this.pemainSocket) {
          this.pemainSocket.send(JSON.stringify({ event: 'esp32_disconnected' }));
        }
      }
    };

    socket.addEventListener('close', closeOrErrorHandler);
    socket.addEventListener('error', closeOrErrorHandler);
  }
}