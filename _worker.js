// File: _worker.js

// =================================================================
// === BAGIAN 1: LOGIKA DARI functions/[token].js ================
// =================================================================
async function handleTokenRequest(request, env, context) {
    // Ambil token dari pathname. Contoh: dari URL /token123, pathname adalah /token123
    const { pathname } = new URL(request.url);
    const tokenKey = pathname.substring(1); // Hapus '/' di awal

    // Cek ke KV Namespace 'TOKEN'
    const credentials = await env.TOKEN.get(tokenKey, { type: 'json' });

    // Jika token tidak ditemukan, kirim pesan error
    if (!credentials) {
        const htmlError = `
            <!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Akses Ditolak</title><style>body { font-family: sans-serif; background-color: #333; color: white; text-align: center; padding-top: 20vh; } h1 { color: #ff6b6b; }</style></head><body><h1>Akses Ditolak</h1><p>Token yang Anda gunakan tidak valid atau tidak ditemukan.</p></body></html>`;
        return new Response(htmlError, {
            status: 403,
            headers: { 'Content-Type': 'text/html;charset=UTF-8' },
        });
    }

    // Jika token ditemukan, tampilkan C.html
    try {
        // Ambil file C.html dari aset statis menggunakan context.next()
        const asset = await context.next('/C.html');
        let html = await asset.text();

        // Siapkan skrip untuk disuntikkan
        const injectionScript = `
        <script>
            window.MQTT_CREDENTIALS = { user: "${credentials.user}", pass: "${credentials.pass}" };
            window.ID = ${credentials.id};
        </script>`;

        // Suntikkan skrip sebelum </body>
        html = html.replace('</body>', `${injectionScript}</body>`);

        return new Response(html, { headers: asset.headers });

    } catch (e) {
        return new Response('Gagal memuat halaman kontroler.', { status: 500 });
    }
}

// =================================================================
// === BAGIAN 2: LOGIKA DARI functions/admin.js ===================
// =================================================================
// Kita pindahkan semua fungsi dari admin.js ke sini
function generateSecureToken(length = 32) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

function renderAdminPage(tokens, requestUrl) {
    // (Salin dan tempel SELURUH fungsi renderAdminPage dari admin.js di sini)
    // ... isinya sangat panjang, jadi saya singkat. Pastikan Anda menyalin semuanya.
    const baseUrl = new URL(requestUrl).origin;
    return `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Admin Panel</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;margin:0;background-color:#f4f4f4;color:#333}.container{max-width:1200px;margin:20px auto;padding:20px;background-color:#fff;box-shadow:0 0 10px rgba(0,0,0,.1);border-radius:8px}h1,h2{color:#0056b3}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{padding:12px;border:1px solid #ddd;text-align:left}th{background-color:#007bff;color:#fff}tr:nth-child(even){background-color:#f2f2f2}form{display:inline-block;margin:0}.btn{cursor:pointer;padding:8px 12px;border:none;border-radius:4px;color:#fff;font-weight:700;text-decoration:none;display:inline-block;margin:2px}.btn-add{background-color:#28a745}.btn-edit{background-color:#ffc107;color:#333}.btn-generate{background-color:#17a2b8}.btn-copy{background-color:#6c757d}.btn-delete{background-color:#dc3545}.btn-save{background-color:#007bff}.add-form{background-color:#e9ecef;padding:20px;border-radius:8px;margin-bottom:30px}.add-form input{width:calc(100% - 24px);padding:10px;margin-bottom:10px;border:1px solid #ccc;border-radius:4px}.add-form .btn-add{width:100%;padding:12px}.word-break{word-break:break-all}</style></head><body><div class="container"><h1>Panel Admin</h1><h2>Tambah Token Baru</h2><div class="add-form"><form method="POST" action="/admin"><input type="hidden" name="action" value="add"><label for="user">User:</label><input type="text" id="user" name="user" required><label for="pass">Password:</label><input type="text" id="pass" name="pass" required><button type="submit" class="btn btn-add">Tambah Token</button></form></div><h2>Daftar Token</h2><table><thead><tr><th>ID</th><th>User</th><th>Password</th><th>Token</th><th>Aksi</th></tr></thead><tbody>${tokens.map(t=>`<tr><form method="POST" action="/admin"><input type="hidden" name="action" value="update"><input type="hidden" name="token_key" value="${t.key}"><input type="hidden" name="id" value="${t.value.id}"><td>${t.value.id}</td><td><input type="text" name="user" value="${t.value.user}"></td><td><input type="text" name="pass" value="${t.value.pass}"></td><td class="word-break">${t.key}</td><td><button type="submit" class="btn btn-save">Simpan</button></form><form method="POST" action="/admin"><input type="hidden" name="action" value="generate_new"><input type="hidden" name="token_key" value="${t.key}"><button type="submit" class="btn btn-generate">Generate Baru</button></form><button class="btn btn-copy" data-token="${t.key}">Copy URL</button><form method="POST" action="/admin" onsubmit="return confirm('Yakin hapus?');"><input type="hidden" name="action" value="delete"><input type="hidden" name="token_key" value="${t.key}"><button type="submit" class="btn btn-delete">Hapus</button></form></td></tr>`).join('')}</tbody></table></div><script>document.querySelectorAll('.btn-copy').forEach(b=>{b.addEventListener('click',function(){const t=this.getAttribute('data-token'),o=\`${baseUrl}/\${t}\`;navigator.clipboard.writeText(o).then(()=>{alert('URL disalin: '+o)}).catch(e=>{console.error('Gagal:',e),alert('Gagal menyalin.')})})});</script></body></html>`;
}

async function handleAdminRequest(request, env) {
    const url = new URL(request.url);

    // 1. AUTENTIKASI
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Basic ')) {
        return new Response('Autentikasi diperlukan.', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Admin Area"' } });
    }
    const [user, pass] = atob(authHeader.substring(6)).split(':');
    const adminData = await env.ADMIN.get(`admin:${user}`, 'json');
    if (!adminData || adminData.pass !== pass) {
        return new Response('Username atau password salah.', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Admin Area"' } });
    }

    // 2. PENANGANAN AKSI (POST)
    if (request.method === 'POST') {
        const formData = await request.formData();
        const action = formData.get('action');
        const tokenKey = formData.get('token_key');
        // (Salin dan tempel SELURUH logika switch case dari admin.js di sini)
        switch(action){case"add":{const e=formData.get("user"),t=formData.get("pass");if(e&&t){const a=(await env.TOKEN.list()).keys,o=await Promise.all(a.map(e=>env.TOKEN.get(e.name,"json"))),n=o.reduce((e,t)=>t&&t.id>e?t.id:e,0),r=generateSecureToken(),s={id:n+1,user:e,pass:t};await env.TOKEN.put(r,JSON.stringify(s))}}break;case"update":{const e=formData.get("user"),t=formData.get("pass"),a=parseInt(formData.get("id"),10);if(tokenKey&&e&&t){const o={id:a,user:e,pass:t};await env.TOKEN.put(tokenKey,JSON.stringify(o))}}break;case"generate_new":if(tokenKey){const e=await env.TOKEN.get(tokenKey);if(e){const t=generateSecureToken();await env.TOKEN.put(t,e),await env.TOKEN.delete(tokenKey)}}break;case"delete":tokenKey&&await env.TOKEN.delete(tokenKey)}
        return Response.redirect(url.origin + url.pathname, 303);
    }

    // 3. MENAMPILKAN HALAMAN (GET)
    if (request.method === 'GET') {
        const list = await env.TOKEN.list();
        let allTokenData = [];
        if (list.keys.length > 0) {
            allTokenData = await Promise.all(
                list.keys.map(async (key) => ({ key: key.name, value: await env.TOKEN.get(key.name, 'json') }))
            );
            allTokenData = allTokenData.filter(item => item.value && typeof item.value.id !== 'undefined').sort((a, b) => a.value.id - b.value.id);
        }
        const html = renderAdminPage(allTokenData, request.url);
        return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    }

    return new Response('Metode tidak diizinkan', { status: 405 });
}


// =================================================================
// === BAGIAN 3: LOGIKA DARI functions/index.js ===================
// =================================================================
function handleIndexRequest(request) {
    const htmlInfo = `
        <!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Perlu Token</title><style>body { font-family: sans-serif; background-color: #333; color: white; text-align: center; padding-top: 20vh; } code { background-color: #555; padding: 2px 5px; border-radius: 4px; }</style></head><body><h1>Diperlukan Token Akses</h1><p>Silakan akses halaman ini menggunakan URL yang berisi token Anda.</p><p>Contoh: <code>https://${new URL(request.url).hostname}/nama_token_anda</code></p></body></html>`;

    return new Response(htmlInfo, {
        status: 401,
        headers: { 'Content-Type': 'text/html;charset=UTF-8' },
    });
}


// =================================================================
// === BAGIAN 4: ROUTER UTAMA (ENTRY POINT) ========================
// =================================================================
export default {
    async fetch(request, env, context) {
        const { pathname } = new URL(request.url);

        // Routing Logic
        // Kita tentukan apa yang harus dilakukan berdasarkan path URL.

        // Rute 1: Halaman utama
        if (pathname === '/') {
            return handleIndexRequest(request);
        }

        // Rute 2: Halaman admin
        if (pathname === '/admin') {
            return handleAdminRequest(request, env);
        }
        
        // Rute 3: Cek apakah ini file statis (CSS, JS, dll)
        // Ini menggantikan logika `isStaticAsset` yang ada di [token].js lama Anda.
        // Regex ini mendeteksi jika path diakhiri dengan ekstensi file umum.
        if (/\.(css|js|svg|png|jpg|jpeg|gif|ico|webmanifest|html)$/.test(pathname)) {
            // Jika ya, serahkan ke handler aset bawaan Cloudflare Pages.
            // context.next() adalah kuncinya.
            return context.next();
        }

        // Rute 4 (Default/Catch-all): Anggap sebagai request token
        // Jika tidak cocok dengan rute di atas, kita asumsikan ini adalah request token.
        return handleTokenRequest(request, env, context);
    },
};