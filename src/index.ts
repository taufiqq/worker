// src/index.ts

import { Hono } from 'hono'

const app = new Hono()

// 1. Rute utama
app.get('/', (c) => {
  return c.text('Selamat Datang di Web Hono Sederhana!')
})

// 2. Rute dengan respons JSON (seperti API)
app.get('/api/posts', (c) => {
  const posts = [
    { id: 1, title: 'Belajar Hono' },
    { id: 2, title: 'Deploy ke Cloudflare' },
  ]
  return c.json(posts) // Mengembalikan data dalam format JSON
})

// 3. Rute dinamis dengan parameter
app.get('/user/:name', (c) => {
  const name = c.req.param('name') // Mengambil parameter 'name' dari URL
  return c.text(`Halo, ${name}! Terima kasih sudah berkunjung.`)
})

// 4. Menangani rute yang tidak ditemukan (404)
app.notFound((c) => {
  return c.text('Halaman tidak ditemukan :(', 404)
})

export default app