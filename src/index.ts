import { Hono } from 'hono'
import { serveStatic } from 'hono/cloudflare-workers'

const app = new Hono()

// Middleware untuk serve file statis
app.use('*', serveStatic({ root: './public' }))

app.get('/api/hello', (c) => c.text('Hello from API'))

export default app
