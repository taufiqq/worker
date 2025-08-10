// src/index.js - Titik Masuk dan Router Utama

import { Hono } from 'hono';

// Impor komponen yang relevan
// HAPUS: import { ClaimLockDO } from './durable-objects/claimLock.do.js';
import { adminAuth } from './middleware/adminAuth.js';
import { handleAdminPage } from './routes/admin.js';
import adminApiRoutes from './routes/adminApi.js';
import { handleTokenClaim } from './routes/token.js';
import { handleVideoStreamPage } from './routes/video.js'; // <-- IMPOR BARU

// Inisialisasi aplikasi Hono
const app = new Hono();

// ==========================================================
// PENDEFINISIAN RUTE (Perakitan)
// ==========================================================

// --- RUTE #1: Admin Panel ---
app.get('/admin', adminAuth, handleAdminPage);

// --- RUTE #2: Admin API ---
app.route('/api/admin', adminApiRoutes);

// Rute ini akan menangkap URL seperti /video/123, /video/456, dll.
app.get('/video/:id_mobil', adminAuth, handleVideoStreamPage); // <-- RUTE BARU

/ Rute khusus untuk menangani koneksi WebSocket
app.get('/ws', (c) => {
  // Cari header "Upgrade: websocket".
  const upgradeHeader = c.req.header('Upgrade');

  if (!upgradeHeader || upgradeHeader !== 'websocket') {
    return new Response('Diharapkan request WebSocket.', { status: 426 });
  }

  // Jika ini adalah permintaan WebSocket, buat WebSocketPair.
  const { 0: client, 1: server } = new WebSocketPair();

  // Terima koneksi pada sisi server
  server.accept();

  // State (counter) untuk koneksi ini saja
  let count = 0;

  // Kirim pesan selamat datang
  server.send(JSON.stringify({
    message: 'Halo dari Hono WebSocket! Anda terhubung.',
    count: count
  }));

  // Listener untuk pesan dari klien
  server.addEventListener('message', async (event) => {
    const command = event.data;

    if (command === 'increment') {
      count++;
      server.send(JSON.stringify({ message: 'Counter ditambah!', count: count }));
    } else if (command === 'decrement') {
      count--;
      server.send(JSON.stringify({ message: 'Counter dikurangi!', count: count }));
    } else if (command === 'reset') {
      count = 0;
      server.send(JSON.stringify({ message: 'Counter direset!', count: count }));
    } else {
      server.send(JSON.stringify({ message: `Perintah tidak dikenal: "${command}"`, count: count }));
    }
  });

  // Listener untuk koneksi yang ditutup
  server.addEventListener('close', (event) => {
    console.log(`Koneksi ditutup. Kode: ${event.code}, Alasan: ${event.reason}`);
  });

  // Listener untuk error
  server.addEventListener('error', (event) => {
    console.error('Terjadi error pada WebSocket:', event);
  });

  // Kembalikan response dengan status 101 dan lampirkan WebSocket
  // Ini adalah cara standar untuk "meng-upgrade" koneksi HTTP ke WebSocket.
  return new Response(null, {
    status: 101,
    webSocket: client,
  });
});

// --- RUTE #3: Token Pengguna (Generik) ---
app.get('/:token', handleTokenClaim);

// --- RUTE #4: Fallback untuk Aset Statis dan Root ---
app.get('*', (c) => {
    return c.env.ASSETS.fetch(c.req.raw);
});

/

// --- Ekspor Worker ---
export default {
  fetch: app.fetch,
//  ClaimLockDO: ClaimLockDO, 
};