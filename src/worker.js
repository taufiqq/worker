// src/worker.js

// Impor konten file statis sebagai string
// Anda perlu memastikan file-file ini ada di src/assets/
import C_HTML from './assets/C.html';
import STYLE_CSS from './assets/style.css';
import SCRIPT_JS from './assets/script.js';
import PAHO_MQTT_JS from './assets/paho-mqtt.min.js'; // Pastikan Anda mengunduh Paho MQTT ke folder assets

// --- FUNGSI HELPER UNTUK ADMIN PANEL (DARI functions/admin.js) ---
function generateSecureToken(length = 32) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function verifyAdminAuth(request, env) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Basic ')) {
        return false;
    }
    const encoded = authHeader.split(' ')[1];
    const decoded = atob(encoded);
    const [username, password] = decoded.split(':');

    const adminConfig = await env.ADMIN.get(`admin:${username}`, 'json');
    if (!adminConfig || adminConfig.pass !== password) {
        return false;
    }
    return true;
}

function renderAdminPage(tokens, requestUrl) {
    const baseUrl = new URL(requestUrl).origin;
    // ... (sertakan seluruh kode renderAdminPage dari functions/admin.js di sini) ...
    // Saya tidak akan menyertakan seluruh kode HTML di sini untuk singkatnya,
    // tetapi pastikan Anda menyalinnya dengan benar dari functions/admin.js
    return `
    <!DOCTYPE html>
    <html lang=\"id\">
    <head>
        <meta charset=\"UTF-8\">
        <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">
        <title>Admin Panel - Manajemen Token</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif; margin: 0; background-color: #f4f4f4; color: #333; }
            .container { max-width: 1200px; margin: 20px auto; padding: 20px; background-color: #fff; box-shadow: 0 0 10px rgba(0,0,0,0.1); border-radius: 8px; }
            h1, h2 { color: #0056b3; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { padding: 12px; border: 1px solid #ddd; text-align: left; }
            th { background-color: #e2e2e2; }
            .form-section { background-color: #f9f9f9; padding: 20px; border-radius: 8px; margin-top: 20px; border: 1px solid #eee; }
            input[type=\"text\"], input[type=\"password\"], input[type=\"number\"] {
                width: calc(100% - 22px);
                padding: 10px;
                margin-bottom: 10px;
                border: 1px solid #ccc;
                border-radius: 4px;
            }
            button {
                padding: 10px 20px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: bold;
                margin-right: 10px;
            }
            button.primary { background-color: #007bff; color: white; }
            button.danger { background-color: #dc3545; color: white; }
            button.secondary { background-color: #6c757d; color: white; }
            .action-buttons button { margin-right: 5px; margin-bottom: 5px; }
            .token-list { margin-top: 30px; }
            .modal {
                display: none;
                position: fixed;
                z-index: 1000;
                left: 0;
                top: 0;
                width: 100%;
                height: 100%;
                overflow: auto;
                background-color: rgba(0,0,0,0.4);
                justify-content: center;
                align-items: center;
            }
            .modal-content {
                background-color: #fefefe;
                margin: auto;
                padding: 20px;
                border: 1px solid #888;
                width: 80%;
                max-width: 500px;
                border-radius: 8px;
                position: relative;
            }
            .close-button {
                color: #aaa;
                float: right;
                font-size: 28px;
                font-weight: bold;
                position: absolute;
                right: 15px;
                top: 10px;
                cursor: pointer;
            }
            .close-button:hover,
            .close-button:focus {
                color: black;
                text-decoration: none;
                cursor: pointer;
            }
        </style>
    </head>
    <body>
        <div class=\"container\">
            <h1>Admin Panel - Manajemen Token</h1>

            <div class=\"form-section\">
                <h2>Tambah Token Baru</h2>
                <form method=\"POST\" action=\"/admin\">
                    <input type=\"hidden\" name=\"action\" value=\"create\">
                    <label for=\"new-token\">Token:</label>
                    <input type=\"text\" id=\"new-token\" name=\"token\" placeholder=\"Biarkan kosong untuk otomatis atau masukkan sendiri\" autocomplete=\"off\"><br>
                    <label for=\"new-user\">User:</label>
                    <input type=\"text\" id=\"new-user\" name=\"user\" placeholder=\"Username MQTT\"><br>
                    <label for=\"new-pass\">Pass:</label>
                    <input type=\"text\" id=\"new-pass\" name=\"pass\" placeholder=\"Password MQTT\"><br>
                    <label for=\"new-id\">ID (angka unik):</label>
                    <input type=\"number\" id=\"new-id\" name=\"id\" placeholder=\"ID unik (misal: 1, 2, 3)\" min=\"1\"><br>
                    <button type=\"submit\" class=\"primary\">Tambah Token</button>
                </form>
            </div>

            <div class=\"token-list\">
                <h2>Daftar Token</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Token Key</th>
                            <th>User MQTT</th>
                            <th>ID</th>
                            <th>Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tokens.map(t => `
                            <tr>
                                <td>${t.key}</td>
                                <td>${t.value.user}</td>
                                <td>${t.value.id}</td>
                                <td>
                                    <button class=\"secondary\" onclick=\"showEditModal('${t.key}', '${t.value.user}', '${t.value.pass}', '${t.value.id}')\">Edit</button>
                                    <form method=\"POST\" action=\"/admin\" style=\"display:inline-block;\">
                                        <input type=\"hidden\" name=\"action\" value=\"delete\">
                                        <input type=\"hidden\" name=\"token_key\" value=\"${t.key}\">
                                        <button type=\"submit\" class=\"danger\" onclick=\"return confirm('Yakin ingin menghapus token ini?');\">Hapus</button>
                                    </form>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <div id=\"editModal\" class=\"modal\">
            <div class=\"modal-content\">
                <span class=\"close-button\" onclick=\"hideEditModal()\">&times;</span>
                <h2>Edit Token</h2>
                <form id=\"editForm\" method=\"POST\" action=\"/admin\">
                    <input type=\"hidden\" name=\"action\" value=\"update\">
                    <input type=\"hidden\" id=\"edit-old-token-key\" name=\"old_token_key\">
                    <label for=\"edit-token\">Token Key:</label>
                    <input type=\"text\" id=\"edit-token\" name=\"token_key\" readonly><br>
                    <label for=\"edit-user\">User MQTT:</label>
                    <input type=\"text\" id=\"edit-user\" name=\"user\"><br>
                    <label for=\"edit-pass\">Pass MQTT:</label>
                    <input type=\"text\" id=\"edit-pass\" name=\"pass\"><br>
                    <label for=\"edit-id\">ID (angka unik):</label>
                    <input type=\"number\" id=\"edit-id\" name=\"id\" min=\"1\"><br>
                    <button type=\"submit\" class=\"primary\">Simpan Perubahan</button>
                </form>
            </div>
        </div>

        <script>
            // Skrip untuk Modal Edit
            function showEditModal(tokenKey, user, pass, id) {
                document.getElementById('edit-old-token-key').value = tokenKey;
                document.getElementById('edit-token').value = tokenKey;
                document.getElementById('edit-user').value = user;
                document.getElementById('edit-pass').value = pass;
                document.getElementById('edit-id').value = id;
                document.getElementById('editModal').style.display = 'flex';
            }

            function hideEditModal() {
                document.getElementById('editModal').style.display = 'none';
            }

            // Optional: Generate token otomatis saat form create diisi
            document.addEventListener('DOMContentLoaded', () => {
                const newTokenInput = document.getElementById('new-token');
                newTokenInput.addEventListener('focus', () => {
                    if (!newTokenInput.value) {
                        newTokenInput.value = generateSecureToken(16); // Generate 16 karakter token
                    }
                });
            });
            // Fungsi generateSecureToken harus tersedia di scope global jika Anda ingin memanggilnya dari dalam script di HTML ini.
            // Atau letakkan fungsi ini di dalam skrip ini. Untuk kemudahan, kita akan buat di global.
            function generateSecureToken(length = 32) {
                const array = new Uint8Array(length);
                crypto.getRandomValues(array);
                return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
            }
        </script>
    </body>
    </html>
    `;
}

// --- MAIN WORKER LISTENER ---
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        // --- 1. HANDLE ASSET STATIS ---
        // Jika path adalah untuk C.html, style.css, script.js, atau paho-mqtt.min.js
        if (path === '/C.html') {
            return new Response(C_HTML, {
                headers: { 'Content-Type': 'text/html;charset=UTF-8' },
            });
        }
        if (path === '/style.css') {
            return new Response(STYLE_CSS, {
                headers: { 'Content-Type': 'text/css;charset=UTF-8' },
            });
        }
        if (path === '/script.js') {
            return new Response(SCRIPT_JS, {
                headers: { 'Content-Type': 'application/javascript;charset=UTF-8' },
            });
        }
        if (path === '/paho-mqtt.min.js') {
            return new Response(PAHO_MQTT_JS, {
                headers: { 'Content-Type': 'application/javascript;charset=UTF-8' },
            });
        }

        // --- 2. HANDLE ADMIN PANEL ---
        if (path === '/admin') {
            // Autentikasi Admin
            const isAuthenticated = await verifyAdminAuth(request, env);
            if (!isAuthenticated) {
                return new Response('Unauthorized', {
                    status: 401,
                    headers: {
                        'WWW-Authenticate': 'Basic realm="Admin Area"',
                    },
                });
            }

            // Logika POST untuk Admin (CREATE, UPDATE, DELETE)
            if (method === 'POST') {
                const formData = await request.formData();
                const action = formData.get('action');
                const tokenKey = formData.get('token_key') || formData.get('token'); // Bisa dari edit atau create

                switch (action) {
                    case 'create': {
                        let newTokenKey = formData.get('token');
                        if (!newTokenKey) {
                            newTokenKey = generateSecureToken(16); // Default 16 karakter jika kosong
                        }
                        const user = formData.get('user');
                        const pass = formData.get('pass');
                        const id = parseInt(formData.get('id')); // Pastikan ini angka
                        if (newTokenKey && user && pass && !isNaN(id)) {
                            await env.TOKEN.put(newTokenKey, JSON.stringify({ user, pass, id }));
                        }
                        break;
                    }
                    case 'update': {
                        const oldTokenKey = formData.get('old_token_key'); // Token key lama jika ada perubahan token key
                        const newTokenKey = formData.get('token_key');
                        const user = formData.get('user');
                        const pass = formData.get('pass');
                        const id = parseInt(formData.get('id'));
                        if (oldTokenKey && newTokenKey && user && pass && !isNaN(id)) {
                            await env.TOKEN.put(newTokenKey, JSON.stringify({ user, pass, id }));
                            if (oldTokenKey !== newTokenKey) { // Jika token key diubah, hapus yang lama
                                await env.TOKEN.delete(oldTokenKey);
                            }
                        }
                        break;
                    }
                    case 'delete': {
                        if (tokenKey) {
                            await env.TOKEN.delete(tokenKey);
                        }
                        break;
                    }
                }
                return Response.redirect(url.origin + url.pathname, 303); // Redirect kembali ke admin
            }

            // Logika GET untuk Admin (TAMPILKAN LIST)
            if (method === 'GET') {
                const list = await env.TOKEN.list();
                let allTokenData = [];

                if (list.keys.length > 0) {
                    const promises = list.keys.map(async (key) => {
                        const value = await env.TOKEN.get(key.name, 'json');
                        return { key: key.name, value };
                    });
                    allTokenData = await Promise.all(promises);
                    // Filter data yang null/kosong dan urutkan berdasarkan ID
                    allTokenData = allTokenData
                        .filter(item => item.value && typeof item.value.id !== 'undefined')
                        .sort((a, b) => a.value.id - b.value.id);
                }

                const html = renderAdminPage(allTokenData, request.url);
                return new Response(html, {
                    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
                });
            }

            return new Response('Method Not Allowed', { status: 405 });
        }

        // --- 3. HANDLE TOKEN DYNAMIC ROUTE ---
        // Asumsikan path seperti /<token_anda>
        // Ambil token dari path, contoh: dari "/mytoken123" akan jadi "mytoken123"
        const tokenKey = path.substring(1); // Hapus leading '/'

        if (tokenKey) {
            const credentials = await env.TOKEN.get(tokenKey, { type: 'json' });

            if (!credentials) {
                // Token tidak ditemukan
                const htmlError = `
                    <!DOCTYPE html>
                    <html lang="id">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Token Tidak Valid</title>
                        <style>
                            body { font-family: sans-serif; background-color: #333; color: white; text-align: center; padding-top: 20vh; }
                        </style>
                    </head>
                    <body>
                        <h1>Akses Ditolak</h1>
                        <p>Token yang Anda gunakan tidak valid atau tidak ditemukan.</p>
                    </body>
                    </html>`;
                return new Response(htmlError, {
                    status: 403,
                    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
                });
            }

            // Jika token ditemukan, suntikkan kredensial ke C.html
            let html = C_HTML; // Gunakan konten C.html yang diimpor

            const injectionScript = `
                <script>
                    window.MQTT_CREDENTIALS = {
                        user: "${credentials.user}",
                        pass: "${credentials.pass}"
                    };
                    window.ID = ${credentials.id};
                </script>
            `;

            html = html.replace('</body>', `${injectionScript}</body>`);

            return new Response(html, {
                headers: { 'Content-Type': 'text/html;charset=UTF-8' },
            });
        }

        // --- 4. HANDLE ROOT PATH (default: instruksi token) ---
        // Jika tidak ada token di path dan bukan admin atau aset statis
        const htmlInfo = `
            <!DOCTYPE html>
            <html lang="id">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Perlu Token</title>
                <style>
                    body { font-family: sans-serif; background-color: #333; color: white; text-align: center; padding-top: 20vh; }
                    code { background-color: #555; padding: 2px 5px; border-radius: 4px; }
                </style>
            </head>
            <body>
                <h1>Diperlukan Token Akses</h1>
                <p>Silakan akses halaman ini menggunakan URL yang berisi token Anda.</p>
                <p>Contoh: <code>https://${url.hostname}/nama_token_anda</code></p>
            </body>
            </html>`;
        return new Response(htmlInfo, {
            status: 401,
            headers: { 'Content-Type': 'text/html;charset=UTF-8' },
        });
    },
};