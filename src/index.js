// src/index.js
import { Hono } from 'hono';
import { WebRTCDurableObject } from './webrtc.do.js';

const app = new Hono();

// Rute ini akan menangani permintaan upgrade WebSocket
app.get('/ws/:sessionId', (c) => {
  // sessionId digunakan untuk memastikan sender & receiver masuk ke "ruangan" DO yang sama
  const sessionId = c.req.param('sessionId');
  
  // Dapatkan stub Durable Object berdasarkan nama sesi
  const doId = c.env.WEBRTC_DO.idFromName(sessionId);
  const doStub = c.env.WEBRTC_DO.get(doId);

  // Teruskan permintaan ke Durable Object
  return doStub.fetch(c.req.raw);
});

export default {
  fetch: app.fetch,
};

// Ekspor kelas DO agar wrangler bisa menemukannya
export { WebRTCDurableObject };