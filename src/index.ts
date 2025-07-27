import { Hono } from 'hono'
import { serveStatic } from 'hono/cloudflare-workers'

const app = new Hono()

// Serve file statis dari bucket (public)
app.use('*', serveStatic())

app.get('/api/hello', (c) => c.text('Hello from API'))

export default app
