// Definisikan kelas Durable Object
export class TokenValidator {
  state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/validate/')) {
      const receivedToken = url.pathname.split('/')[2];
      const storedToken = await this.state.storage.get<string>('token');
      const isValid = storedToken !== undefined && storedToken === receivedToken;
      return new Response(JSON.stringify({ success: isValid }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/set' && request.method === 'POST') {
      try {
        const { token } = await request.json<{ token: string }>();
        if (!token) {
          return new Response('Token tidak boleh kosong', { status: 400 });
        }
        await this.state.storage.put('token', token);
        return new Response(JSON.stringify({ message: 'Token berhasil diperbarui' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response('Body JSON tidak valid', { status: 400 });
      }
    }

    return new Response('Endpoint tidak ditemukan di dalam Object', { status: 404 });
  }
}

// Export worker yang hanya berfungsi sebagai "pintu masuk" ke DO
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Kita tidak mengharapkan request langsung ke Worker ini,
    // tapi kita bisa menggunakannya untuk hal lain jika perlu.
    // Untuk sekarang, kita hanya akan merespon dengan pesan sederhana.
    return new Response("Ini adalah Worker untuk Durable Object. Akses melalui Pages.", { status: 400 });
  }
}

interface Env {
    // Bindingnya didefinisikan di wrangler.toml
}