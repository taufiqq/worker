// File: src/index.js (VERSI BARU DENGAN INTEGRASI ADMIN)

// =================================================================
//  BAGIAN 1: DURABLE OBJECT CLASS - 'TokenLocker'
//  Sekarang menyimpan lebih banyak data: user, pass, dan IP pemegang.
// =================================================================

export class TokenLocker {
  constructor(state, env) {
    this.state = state;
  }

  // Metode fetch sekarang lebih pintar
  async fetch(request) {
    const url = new URL(request.url);
    const ipAddress = request.headers.get('CF-Connecting-IP');

    // Cek apakah ini request dari admin atau user biasa
    if (url.pathname.endsWith('/admin')) {
      return this.handleAdminRequest(request);
    } else {
      return this.handleUserClaim(request, ipAddress);
    }
  }
  
  // Logika untuk user biasa yang mengklaim token
  async handleUserClaim(request, ipAddress) {
    // Baca semua data yang tersimpan di loker ini
    const data = await this.state.storage.get(['holderIp', 'mqttUser', 'mqttPass']);

    if (!data.get('mqttUser')) {
        return new Response("Token tidak valid atau telah dihapus.", { status: 404 });
    }

    if (data.has('holderIp')) {
      // Sudah ada yang pegang
      if (data.get('holderIp') === ipAddress) {
        // Pemilik yang sama, berikan lagi kredensialnya
        return new Response(JSON.stringify({
            message: "Akses diberikan kembali.",
            mqttUser: data.get('mqttUser'),
            mqttPass: data.get('mqttPass')
        }), { headers: { 'Content-Type': 'application/json' } });
      } else {
        return new Response("Token ini sudah digunakan oleh IP lain.", { status: 403 });
      }
    } else {
      // Belum ada yang pegang, ini pemenangnya!
      await this.state.storage.put('holderIp', ipAddress);
      
      return new Response(JSON.stringify({
        message: "Selamat, Anda mendapatkan akses!",
        mqttUser: data.get('mqttUser'),
        mqttPass: data.get('mqttPass')
      }), { headers: { 'Content-Type': 'application/json' } });
    }
  }

  // Logika untuk request dari admin (setup, delete, get info)
  async handleAdminRequest(request) {
    switch (request.method) {
      case 'POST': // Setup atau update token
        const { mqttUser, mqttPass } = await request.json();
        await this.state.storage.put({ mqttUser, mqttPass });
        return new Response("Token data set.", { status: 200 });
      
      case 'DELETE': // Hapus semua data di loker ini
        await this.state.storage.deleteAll();
        return new Response("Token data deleted.", { status: 200 });

      case 'GET': // Dapatkan info detail loker ini (user, pass, ip)
        const allData = await this.state.storage.list();
        return new Response(JSON.stringify(Object.fromEntries(allData)), {
          headers: { 'Content-Type': 'application/json' }
        });
        
      default:
        return new Response("Method not allowed for admin.", { status: 405 });
    }
  }
}


// =================================================================
//  BAGIAN 2: WORKER UTAMA - Router & Koordinator
// =================================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathSegments = url.pathname.slice(1).split('/');

    // Router sederhana berdasarkan path
    // -> /admin/list_tokens
    // -> /admin/create_token
    // -> /admin/delete_token/nama_token
    // -> /nama_token_rahasia (untuk user)
    if (pathSegments[0] === 'admin') {
      return handleAdminRoutes(request, env);
    } else {
      return handleUserRoutes(request, env);
    }
  },
};

// --- Fungsi Helper untuk Rute Admin ---
async function handleAdminRoutes(request, env) {
  // TODO: Tambahkan Basic Auth di sini jika diperlukan
  const url = new URL(request.url);
  const path = url.pathname;
  
  if (path === '/admin/list_tokens') {
    const list = await env.TOKEN_INDEX.list();
    // Kita hanya mengembalikan nama-nama tokennya
    return new Response(JSON.stringify(list.keys), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (path === '/admin/create_token' && request.method === 'POST') {
    const { mqttUser, mqttPass } = await request.json();
    if (!mqttUser || !mqttPass) {
        return new Response("mqttUser dan mqttPass dibutuhkan", { status: 400 });
    }

    const tokenName = generateSecureToken(16);
    
    // 1. Tambahkan ke indeks KV
    await env.TOKEN_INDEX.put(tokenName, "active");
    
    // 2. Kirim detail ke Durable Object untuk disimpan
    const id = env.TOKEN_LOCKER.idFromName(tokenName);
    const obj = env.TOKEN_LOCKER.get(id);
    // Kita buat sub-path '/admin' agar DO tahu ini request admin
    const adminUrl = new URL(request.url);
    adminUrl.pathname = `/${tokenName}/admin`;
    
    await obj.fetch(adminUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mqttUser, mqttPass })
    });
    
    return new Response(JSON.stringify({ token: tokenName }), { status: 201 });
  }

  if (path.startsWith('/admin/delete_token/')) {
    const tokenName = path.split('/')[3];
    if (!tokenName) return new Response("Nama token dibutuhkan", { status: 400 });

    // 1. Hapus dari indeks KV
    await env.TOKEN_INDEX.delete(tokenName);

    // 2. Kirim perintah delete ke Durable Object
    const id = env.TOKEN_LOCKER.idFromName(tokenName);
    const obj = env.TOKEN_LOCKER.get(id);
    const adminUrl = new URL(request.url);
    adminUrl.pathname = `/${tokenName}/admin`;
    
    await obj.fetch(adminUrl.toString(), { method: 'DELETE' });

    return new Response(`Token ${tokenName} deleted.`, { status: 200 });
  }
  
  return new Response("Admin route not found", { status: 404 });
}

// --- Fungsi Helper untuk Rute User ---
async function handleUserRoutes(request, env) {
  const url = new URL(request.url);
  const tokenName = url.pathname.slice(1);

  // Cek dulu apakah token ada di indeks kita
  const tokenExists = await env.TOKEN_INDEX.get(tokenName);
  if (!tokenExists) {
    return new Response("Token tidak ditemukan atau tidak valid.", { status: 404 });
  }

  // Jika ada, teruskan ke Durable Object
  const id = env.TOKEN_LOCKER.idFromName(tokenName);
  const obj = env.TOKEN_LOCKER.get(id);
  return obj.fetch(request);
}

function generateSecureToken(length = 16) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}