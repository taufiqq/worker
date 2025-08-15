// --- START OF FILE src/index.js ---

import { Hono } from 'hono';

// 1. Impor kelas Durable Object dari file terpisahnya
import { WebSocketDO } from './durable-objects/websocket.do.js';
// ---> BARU: Impor DO untuk contoh sederhana <---
import { SimpleWebRTC_DO } from './durable-objects/simple-webrtc.do.js';


// 2. Impor semua handler rute Anda
import { handleWebSocketUpgrade } from './routes/websocket.js';
import { adminAuth } from './middleware/adminAuth.js';
import { handleAdminPage } from './routes/admin.js';
import adminApiRoutes from './routes/adminApi.js';
import { handleTokenClaim } from './routes/token.js';
import { handleVideoStreamPage } from './routes/video.js';
// ---> BARU: Impor handler untuk rute sederhana <---
import { 
    handleSimpleSenderPage, 
    handleSimpleReceiverPage, 
    handleSimpleWebSocketUpgrade 
} from './routes/simple-webrtc.js';


// 3. Inisialisasi dan pendaftaran rute
const app = new Hono();

// --- RUTE LAMA ANDA (TETAP ADA) ---
app.get('/admin', adminAuth, handleAdminPage);
app.route('/api/admin', adminApiRoutes);
app.get('/video/:id_mobil', adminAuth, handleVideoStreamPage);
app.get('/:token', handleTokenClaim);
app.get('/ws/:sessionId', handleWebSocketUpgrade);

// ---> BARU: Rute untuk contoh WebRTC sederhana <---
app.get('/:sessionId/kirim', handleSimpleSenderPage);
app.get('/:sessionId/terima', handleSimpleReceiverPage);
app.get('/ws-simple/:sessionId', handleSimpleWebSocketUpgrade);


// Rute fallback untuk aset statis (selalu paling akhir)
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw));


// 4. Ekspor utama untuk Cloudflare Worker
export default {
  fetch: app.fetch,
  // Ekspor kelas Durable Object agar Cloudflare dapat menemukannya
  WebSocketDO: WebSocketDO,
  // ---> BARU: Ekspor DO sederhana <---
  SimpleWebRTC_DO: SimpleWebRTC_DO,
};

// Ekspor bernama untuk kompatibilitas
export { WebSocketDO, SimpleWebRTC_DO };