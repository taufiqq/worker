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


// --- RUTE #3: Token Pengguna (Generik) ---
app.get('/:token', handleTokenClaim);

// --- RUTE #4: Fallback untuk Aset Statis dan Root ---
app.get('*', (c) => {
    return c.env.ASSETS.fetch(c.req.raw);
});

// --- Ekspor Worker ---
export default {
  fetch: app.fetch,
//  ClaimLockDO: ClaimLockDO, 
};