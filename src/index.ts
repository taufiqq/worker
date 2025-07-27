// src/index.ts

import { Hono } from 'hono'
import { logger } from 'hono/logger'

// Impor konten file HTML sebagai string
import indexPage from './static/index.html'

const app = new Hono()

app.use('*', logger())

app.get('/', (c) => {
  return c.html(indexPage) 
})

// 2. Rute API tetap sama
app.get('/api/posts', (c) => {
  const posts = [
    { id: 1, title: 'Belajar Hono' },
    { id: 2, title: 'Deploy ke Cloudflare' },
  ]
  return c.json(posts)
})

// 3. Rute dinamis tetap sama
app.get('/user/:name', (c) => {
  const name = c.req.param('name')
  return c.text(`Halo, ${name}! Terima kasih sudah berkunjung.`)
})

// 4. Menangani rute yang tidak ditemukan (404)
app.notFound((c) => {
  return c.text('Halaman tidak ditemukan :(', 404)
})

export default app