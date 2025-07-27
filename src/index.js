// src/index.js

import { Hono } from 'hono';

// Inisialisasi aplikasi Hono dengan akses ke 'Bindings' (env)
// Ini memungkinkan kita untuk mengakses 'ASSETS' di dalam handler.
const app = new Hono();

// 1. Definisikan rute API Anda menggunakan Hono
// Hono akan menangani permintaan yang cocok dengan pola ini.
app.get('/api/*', (c) => {
  console.log('API route matched');
  return c.json({
    name: 'Cloudflare',
    framework: 'Hono',
    message: 'This is a response from an API route!',
  });
});

// 2. Gunakan app.notFound untuk menangani semua permintaan yang TIDAK cocok
// Ini adalah cara yang bersih untuk mengintegrasikan env.ASSETS.fetch
// Jika Hono tidak menemukan rute yang cocok (misalnya, untuk '/', '/style.css', dll.),
// ia akan menjalankan handler ini.
app.notFound((c) => {
  console.log(`Asset request: ${c.req.url}. Passing to env.ASSETS.fetch...`);
  // c.env.ASSETS berasal dari binding di wrangler.toml
  // c.req.raw adalah objek Request asli yang dibutuhkan oleh fetch()
  return c.env.ASSETS.fetch(c.req.raw);
});

// 3. Ekspor aplikasi Hono sebagai default export.
// Cloudflare Worker akan secara otomatis meneruskan 'request' dan 'env' ke dalamnya.
export default app;