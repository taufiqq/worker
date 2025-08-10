// File: admin.client.js (Diperbarui untuk D1 & id_mobil)

document.addEventListener('DOMContentLoaded', () => {
    // --- SETUP MQTT DI KLIEN ---
    const MQTT_HOST = 'xf46ce9c.ala.asia-southeast1.emqxsl.com';
    const MQTT_PORT = 8084;
    const client = new Paho.Client(MQTT_HOST, MQTT_PORT, `admin_panel_${Math.random().toString(16).substr(2, 8)}`);
    let isMqttConnected = false;

    // Fungsi koneksi dan publish tetap sama
    
     const connectMqtt = () => {
        if (!window.ADMIN_MQTT_CREDS || !window.ADMIN_MQTT_CREDS.user) {
            console.error("Kredensial MQTT untuk admin tidak ditemukan!");
            return;
        }
        client.connect({
            useSSL: true,
            userName: window.ADMIN_MQTT_CREDS.user,
            password: window.ADMIN_MQTT_CREDS.pass,
            onSuccess: () => { console.log("Admin panel terhubung ke MQTT."); isMqttConnected = true; },
            onFailure: (err) => { console.error("Gagal terhubung ke MQTT:", err.errorMessage); isMqttConnected = false; }
        });
    };

    const publishKickMessage = (userToKick) => {
        if (!isMqttConnected) {
            alert("Tidak bisa mengirim perintah kick, koneksi MQTT gagal.");
            return;
        }
        const topic = `system/kick/${userToKick}`;
        const message = new Paho.Message('session_revoked');
        message.destinationName = topic;
        client.send(message);
        console.log(`Perintah kick dikirim ke topik: ${topic}`);
    };

    // --- DOM dan API calls ---
    const tableBody = document.querySelector('#tokens-table tbody');
    const addForm = document.getElementById('add-token-form');
    const loadingIndicator = document.getElementById('loading-indicator');
    const apiEndpoint = '/api/admin/token';

    const showLoading = (isLoading) => {
        loadingIndicator.style.display = isLoading ? 'block' : 'none';
    };

    const createButton = (text, className, onClick) => {
        const button = document.createElement('button');
        button.textContent = text;
        button.className = `btn ${className}`;
        button.addEventListener('click', onClick);
        return button;
    };

    const renderTableRow = (tokenData) => {
        const row = document.createElement('tr');
        row.dataset.key = tokenData.key;

        const status = tokenData.value.claimed_by_ip
            ? `<span class="status-claimed" title="Diklaim oleh IP: ${tokenData.value.claimed_by_ip}">&#128274; Terpakai</span>`
            : '<span class="status-available">&#128275; Tersedia</span>';

        // Sekarang menyertakan kolom ID Mobil dan Status
        row.innerHTML = `
            <td>${tokenData.value.id}</td>
            <td><input type="text" class="user-input" value="${tokenData.value.user}"></td>
            <td><input type="text" class="pass-input" value="${tokenData.value.pass}"></td>
            <td><input type="number" class="id-mobil-input" value="${tokenData.value.id_mobil}"></td>
            <td class="word-break">${tokenData.key}</td>
            <td>${status}</td>
        `;

        const actionsCell = document.createElement('td');
        actionsCell.className = 'actions-cell';
        
        const saveBtn = createButton('Simpan', 'btn-save', async (e) => {
            const button = e.target;
            button.disabled = true; button.textContent = 'Menyimpan...';
            const user = row.querySelector('.user-input').value;
            const pass = row.querySelector('.pass-input').value;
            const id_mobil = row.querySelector('.id-mobil-input').value; // Ambil nilai id_mobil
            
            const result = await apiRequest('update', { 
                token_key: tokenData.key, 
                id: tokenData.value.id, 
                user, 
                pass,
                id_mobil // Kirim id_mobil saat update
            });

            button.disabled = false; button.textContent = 'Simpan';
            if(result) {
                alert('Data berhasil disimpan.');
                await fetchTokens(); // Refresh untuk melihat data terbaru
            }
        });
        
        const genBtn = createButton('Generate Baru', 'btn-generate', async (e) => {
            if (!confirm('Yakin ingin generate token baru? Sesi pengguna saat ini akan diputus.')) return;
            const button = e.target;
            button.disabled = true; button.textContent = 'Memproses...';
            const result = await apiRequest('generate_new', { token_key: tokenData.key });
            if (result && result.kickedUser) {
                publishKickMessage(result.kickedUser);
            }
            // HAPUS DELAY: D1 konsisten, bisa langsung refresh
            await fetchTokens(); 
        });

        const copyBtn = createButton('Copy URL', 'btn-copy', () => {
            const urlToCopy = `${window.location.origin}/${tokenData.key}`;
            navigator.clipboard.writeText(urlToCopy).then(() => alert('URL disalin!'));
        });

        const delBtn = createButton('Hapus', 'btn-delete', async (e) => {
            if (!confirm('Yakin ingin menghapus token ini?')) return;
            const button = e.target;
            button.disabled = true; button.textContent = 'Menghapus...';
            const result = await apiRequest('delete', { token_key: tokenData.key });
            if (result && result.kickedUser) {
                publishKickMessage(result.kickedUser);
            }
            // HAPUS DELAY: D1 konsisten, bisa langsung refresh
            await fetchTokens(); 
        });

        actionsCell.append(saveBtn, genBtn, copyBtn, delBtn);
        row.appendChild(actionsCell);
        return row;
    };

    
     const fetchTokens = async () => {
        showLoading(true);
        tableBody.innerHTML = '';
        try {
            const response = await fetch(apiEndpoint, { credentials: 'same-origin' });
            if (!response.ok) {
                 if(response.status === 401 || response.status === 403) {
                    document.body.innerHTML = `<h1>Akses Ditolak</h1><p>Autentikasi gagal. Silakan refresh dan login kembali.</p>`;
                }
                throw new Error(`Gagal mengambil data. Status: ${response.status}`);
            }
            const tokens = await response.json();
            if (tokens.length === 0) {
                 tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center;">Belum ada token.</td></tr>`;
            } else {
                tokens.forEach(token => { tableBody.appendChild(renderTableRow(token)); });
            }
        } catch (error) {
            console.error('Error fetching tokens:', error);
            tableBody.innerHTML = `<tr><td colspan="7" style="color: red; text-align: center;"><b>Error:</b> ${error.message}</td></tr>`;
        } finally {
            showLoading(false);
        }
    };

    
     const apiRequest = async (action, data) => {
        try {
            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, ...data }),
                credentials: 'same-origin'
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Terjadi kesalahan pada server');
            }
            return await response.json();
        } catch (error) {
            console.error(`API request failed for action ${action}:`, error);
            alert(`Error: ${error.message}`);
            return null;
        }
    };
    
    addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const button = e.target.querySelector('button');
        button.disabled = true; button.textContent = 'Menambahkan...';
        const user = document.getElementById('add-user').value;
        const pass = document.getElementById('add-pass').value;
        const id_mobil = document.getElementById('add-id-mobil').value; // Ambil nilai id_mobil
        
        await apiRequest('add', { user, pass, id_mobil }); // Kirim id_mobil ke API
        
        addForm.reset();
        button.disabled = false; button.textContent = 'Tambah Token';

        // HAPUS DELAY: Langsung refresh data dari D1
        await fetchTokens();
    });

    // Jalankan semuanya
    connectMqtt();
    fetchTokens();
});