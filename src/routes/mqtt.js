// src/routes/mqtt.js

import { Hono } from 'hono';

const mqttRoutes = new Hono();

// Rute ini akan menangani GET /mqtt/:id_mobil dengan autentikasi
mqttRoutes.get('/:id_mobil', async (c) => {
  try {
    // 1. Ambil semua parameter yang diperlukan
    const id_mobil = c.req.param('id_mobil');
    const clientType = c.req.query('p');
    const upgradeHeader = c.req.header('Upgrade');

    // 2. Validasi awal
    if (upgradeHeader !== 'websocket') {
      return c.text('Diharapkan koneksi WebSocket', 426); // 426 = Upgrade Required
    }
    if (!id_mobil) {
      return c.text('id_mobil diperlukan di path URL', 400);
    }
    if (!clientType) {
      return c.text('Query parameter "p" diperlukan', 400);
    }

    // 3. Logika Autentikasi Berdasarkan Tipe Klien
    if (clientType === 'pemain') {
      const token = c.req.query('token');
      if (!token) {
        return c.text('Query parameter "token" diperlukan untuk pemain', 401); // 401 Unauthorized
      }

      // Validasi token pemain terhadap D1
      const ps = c.env.DB.prepare('SELECT id_mobil FROM tokens WHERE token = ?').bind(token);
      const result = await ps.first();

      if (!result) {
        return c.text('Token tidak valid atau sudah tidak berlaku', 403); // 403 Forbidden
      }

      // Pastikan token yang diberikan cocok dengan id_mobil di URL
      if (result.id_mobil.toString() !== id_mobil) {
        return c.text('Token tidak cocok dengan ID mobil', 403); // 403 Forbidden
      }
      
      // Jika semua validasi lolos, lanjutkan
      console.log(`Pemain dengan token valid untuk id_mobil ${id_mobil} mencoba terhubung.`);

    } else if (clientType === 'esp32') {
      const tokenEsp32 = c.req.query('tokenesp32');
      if (!tokenEsp32) {
        return c.text('Query parameter "tokenesp32" diperlukan untuk ESP32', 401); // 401 Unauthorized
      }

      // Validasi token ESP32 terhadap KV
      const correctToken = await c.env.ADMIN.get('tokenesp32');
      
      if (!correctToken) {
          console.error("FATAL: Kunci 'tokenesp32' tidak ditemukan di KV namespace 'ADMIN'.");
          return c.text('Kesalahan konfigurasi server', 500);
      }

      if (tokenEsp32 !== correctToken) {
        return c.text('Token ESP32 tidak valid', 403); // 403 Forbidden
      }

      // Jika validasi lolos, lanjutkan
      console.log(`ESP32 dengan token valid untuk id_mobil ${id_mobil} mencoba terhubung.`);

    } else {
      return c.text('Nilai parameter "p" tidak valid. Gunakan "pemain" atau "esp32"', 400);
    }

    // 4. Jika autentikasi berhasil, teruskan ke Durable Object
    const doId = c.env.CAR_SESSION.idFromName(id_mobil);
    const doStub = c.env.CAR_SESSION.get(doId);
    return doStub.fetch(c.req.raw);

  } catch (e) {
      console.error("Auth/WebSocket Route Error:", e);
      return c.text('Terjadi kesalahan internal', 500);
  }
});

export default mqttRoutes;