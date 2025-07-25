// File: src/index.js

// =================================================================
// === BAGIAN 1: FUNGSI-FUNGSI HELPER (HASIL GABUNGAN) ============
// =================================================================

// --- LOGIKA DARI [token].js (Sudah disesuaikan) ---
async function handleTokenRequest(request, env) { // Parameter `context` dihapus
    const { pathname } = new URL(request.url);
    const tokenKey = pathname.substring(1);

    const credentials = await env.TOKEN.get(tokenKey, { type: 'json' });

    if (!credentials) {
        const htmlError = `<!DOCTYPE html><html lang="id"><head><title>Akses Ditolak</title><style>body{font-family:sans-serif;background-color:#333;color:white;text-align:center;padding-top:20vh}h1{color:#ff6b6b}</style></head><body><h1>Akses Ditolak</h1><p>Token tidak valid.</p></body></html>`;
        return new Response(htmlError, { status: 403, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    }

    try {
        // PERUBAHAN UTAMA: Gunakan env.ASSETS.fetch untuk mengambil C.html dari folder /public
        const asset = await env.ASSETS.fetch(new URL('/C.html', request.url));
        let html = await asset.text();

        const injectionScript = `<script>window.MQTT_CREDENTIALS={user:"${credentials.user}",pass:"${credentials.pass}"};window.ID=${credentials.id};</script>`;
        html = html.replace('</body>', `${injectionScript}</body>`);

        return new Response(html, { headers: asset.headers });
    } catch (e) {
        return new Response('Gagal memuat halaman kontroler: ' + e.message, { status: 500 });
    }
}

// --- LOGIKA DARI admin.js (Tidak perlu diubah, tinggal salin) ---
function generateSecureToken(length = 32) { /* ... salin dari kode sebelumnya ... */ const t=new Uint8Array(length);return crypto.getRandomValues(t),Array.from(t,(t=>t.toString(16).padStart(2,"0"))).join("") }
function renderAdminPage(tokens, requestUrl) { /* ... salin dari kode sebelumnya ... */ const t=new URL(requestUrl).origin;return`<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Admin Panel</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;margin:0;background-color:#f4f4f4;color:#333}.container{max-width:1200px;margin:20px auto;padding:20px;background-color:#fff;box-shadow:0 0 10px rgba(0,0,0,.1);border-radius:8px}h1,h2{color:#0056b3}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{padding:12px;border:1px solid #ddd;text-align:left}th{background-color:#007bff;color:#fff}tr:nth-child(even){background-color:#f2f2f2}form{display:inline-block;margin:0}.btn{cursor:pointer;padding:8px 12px;border:none;border-radius:4px;color:#fff;font-weight:700;text-decoration:none;display:inline-block;margin:2px}.btn-add{background-color:#28a745}.btn-edit{background-color:#ffc107;color:#333}.btn-generate{background-color:#17a2b8}.btn-copy{background-color:#6c757d}.btn-delete{background-color:#dc3545}.btn-save{background-color:#007bff}.add-form{background-color:#e9ecef;padding:20px;border-radius:8px;margin-bottom:30px}.add-form input{width:calc(100% - 24px);padding:10px;margin-bottom:10px;border:1px solid #ccc;border-radius:4px}.add-form .btn-add{width:100%;padding:12px}.word-break{word-break:break-all}</style></head><body><div class="container"><h1>Panel Admin</h1><h2>Tambah Token Baru</h2><div class="add-form"><form method="POST" action="/admin"><input type="hidden" name="action" value="add"><label for="user">User:</label><input type="text" id="user" name="user" required><label for="pass">Password:</label><input type="text" id="pass" name="pass" required><button type="submit" class="btn btn-add">Tambah Token</button></form></div><h2>Daftar Token</h2><table><thead><tr><th>ID</th><th>User</th><th>Password</th><th>Token</th><th>Aksi</th></tr></thead><tbody>${tokens.map(e=>`<tr><form method="POST" action="/admin"><input type="hidden" name="action" value="update"><input type="hidden" name="token_key" value="${e.key}"><input type="hidden" name="id" value="${e.value.id}"><td>${e.value.id}</td><td><input type="text" name="user" value="${e.value.user}"></td><td><input type="text" name="pass" value="${e.value.pass}"></td><td class="word-break">${e.key}</td><td><button type="submit" class="btn btn-save">Simpan</button></form><form method="POST" action="/admin"><input type="hidden" name="action" value="generate_new"><input type="hidden" name="token_key" value="${e.key}"><button type="submit" class="btn btn-generate">Generate Baru</button></form><button class="btn btn-copy" data-token="${e.key}">Copy URL</button><form method="POST" action="/admin" onsubmit="return confirm('Yakin hapus?');"><input type="hidden" name="action" value="delete"><input type="hidden" name="token_key" value="${e.key}"><button type="submit" class="btn btn-delete">Hapus</button></form></td></tr>`).join("")}</tbody></table></div><script>document.querySelectorAll('.btn-copy').forEach(e=>{e.addEventListener('click',function(){const e=this.getAttribute('data-token'),n=\`${t}/\${e}\`;navigator.clipboard.writeText(n).then(()=>{alert('URL disalin: '+n)}).catch(t=>{console.error('Gagal:',t),alert('Gagal menyalin.')})})});</script></body></html>`}
async function handleAdminRequest(request, env) { /* ... salin dari kode sebelumnya ... */ const t=new URL(request.url);const n=request.headers.get("Authorization");if(!n||!n.startsWith("Basic "))return new Response("Autentikasi diperlukan.",{status:401,headers:{"WWW-Authenticate":'Basic realm="Admin Area"'}});const[o,s]=atob(n.substring(6)).split(":"),a=await env.ADMIN.get(`admin:${o}`,"json");if(!a||a.pass!==s)return new Response("Username atau password salah.",{status:401,headers:{"WWW-Authenticate":'Basic realm="Admin Area"'}});if("POST"===request.method){const n=await request.formData(),o=n.get("action"),s=n.get("token_key");switch(o){case"add":{const t=n.get("user"),o=n.get("pass");if(t&&o){const s=(await env.TOKEN.list()).keys,a=await Promise.all(s.map(t=>env.TOKEN.get(t.name,"json"))),i=a.reduce(((t,n)=>n&&n.id>t?n.id:t),0),r=generateSecureToken(),d={id:i+1,user:t,pass:o};await env.TOKEN.put(r,JSON.stringify(d))}}break;case"update":{const t=n.get("user"),o=n.get("pass"),a=parseInt(n.get("id"),10);if(s&&t&&o){const i={id:a,user:t,pass:o};await env.TOKEN.put(s,JSON.stringify(i))}}break;case"generate_new":if(s){const t=await env.TOKEN.get(s);if(t){const n=generateSecureToken();await env.TOKEN.put(n,t),await env.TOKEN.delete(s)}}break;case"delete":s&&await env.TOKEN.delete(s)}return Response.redirect(t.origin+t.pathname,303)}if("GET"===request.method){const n=(await env.TOKEN.list()).keys;let o=[];if(n.length>0){const t=n.map((async t=>{const n=await env.TOKEN.get(t.name,"json");return{key:t.name,value:n}}));o=await Promise.all(t),o=o.filter((t=>t.value&&void 0!==t.value.id)).sort(((t,n)=>t.value.id-n.value.id))}const s=renderAdminPage(o,request.url);return new Response(s,{headers:{"Content-Type":"text/html;charset=UTF-8"}})}return new Response("Metode tidak diizinkan",{status:405})}

// --- LOGIKA DARI index.js (Tidak perlu diubah, tinggal salin) ---
function handleIndexRequest(request) {
    const htmlInfo = `<!DOCTYPE html><html lang="id"><head><title>Perlu Token</title><style>body{font-family:sans-serif;background-color:#333;color:white;text-align:center;padding-top:20vh}code{background-color:#555;padding:2px 5px;border-radius:4px}</style></head><body><h1>Diperlukan Token Akses</h1><p>Silakan akses halaman ini menggunakan URL dengan token.</p><p>Contoh: <code>https://${new URL(request.url).hostname}/nama_token_anda</code></p></body></html>`;
    return new Response(htmlInfo, { status: 401, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}


// =================================================================
// === BAGIAN 2: EXPORT UTAMA (ROUTER) ============================
// =================================================================

export default {
    async fetch(request, env, context) {
        try {
            const url = new URL(request.url);
            const { pathname } = url;

            // Rute 1: Halaman Admin
            if (pathname.startsWith('/admin')) {
                return handleAdminRequest(request, env);
            }

            // Rute 2: Halaman Utama
            if (pathname === '/') {
                return handleIndexRequest(request);
            }

            // Cek apakah ini request untuk aset statis?
            const isStaticAsset = /\.(css|js|svg|png|jpg|jpeg|gif|ico|webmanifest|html)$/.test(pathname);
            if (isStaticAsset) {
                // Jika ya, serahkan ke handler aset bawaan Worker.
                return env.ASSETS.fetch(request);
            }

            // Rute 3 (Catch-all): Jika BUKAN aset, anggap sebagai request token.
            // Ini akan menangani path seperti /token123, /tokenabc, dll.
            return handleTokenRequest(request, env);

        } catch (e) {
            // Pengaman jika terjadi error tak terduga
            return new Response(e.stack || e, { status: 500 });
        }
    }
};

// Jika Anda pakai Durable Objects, ekspor kelasnya di sini juga.
// export class Counter { /* ... implementasi DO ... */ }