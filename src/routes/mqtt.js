// src/routes/mqtt.js

import { Hono } from 'hono';

const mqttRoutes = new Hono();

// Rute ini akan menangani GET /mqtt/:id_mobil
mqttRoutes.get('/:id_mobil', async (c) => {
  const id_mobil = c.req.param('id_mobil');
  if (!id_mobil) {
    return c.text('id_mobil diperlukan', 400);
  }
  
  // Cek apakah header 'Upgrade: websocket' ada di request
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return c.text('Diharapkan koneksi WebSocket', 426); // 426 = Upgrade Required
  }

  // Dapatkan ID unik untuk Durable Object berdasarkan id_mobil
  const doId = c.env.CAR_SESSION.idFromName(id_mobil);
  
  // Dapatkan 'stub' (proxy) untuk berkomunikasi dengan instance Durable Object
  const doStub = c.env.CAR_SESSION.get(doId);

  // Teruskan request asli ke Durable Object untuk di-handle
  // Durable Object akan melakukan handshake WebSocket
  return doStub.fetch(c.req.raw);
});

export default mqttRoutes;