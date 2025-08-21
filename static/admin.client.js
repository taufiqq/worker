// File: admin.client.js (Diperbarui untuk D1, tanpa user/pass & MQTT)

document.addEventListener('DOMContentLoaded', () => {
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

        // Menghilangkan kolom User dan Password
        row.innerHTML = `
            <td>${tokenData.value.id}</td>
            <td><input type="number" class="id-mobil-input" value="${tokenData.value.id_mobil}"></td>
            <td class="word-break">${tokenData.key}</td>
            <td>${status}</td>
        `;

        const actionsCell = document.createElement('td');
        actionsCell.className = 'actions-cell';
        
        const saveBtn = createButton('Simpan', 'btn-save', async (e) => {
            const button = e.target;
            button.disabled = true; button.textContent = 'Menyimpan...';
            const id_mobil = row.querySelector('.id-mobil-input').value;
            
            const result = await apiRequest('update', { 
                token_key: tokenData.key, 
                id: tokenData.value.id, 
                id_mobil
            });

            button.disabled = false; button.textContent = 'Simpan';
            if(result) {
                alert('Data berhasil disimpan.');
                await fetchTokens();
            }
        });
        
        const genBtn = createButton('Generate Baru', 'btn-generate', async (e) => {
            if (!confirm('Yakin ingin generate token baru? Sesi pengguna saat ini akan diputus.')) return;
            const button = e.target;
            button.disabled = true; button.textContent = 'Memproses...';
            await apiRequest('generate_new', { token_key: tokenData.key });
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
            await apiRequest('delete', { token_key: tokenData.key });
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
                 tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center;">Belum ada token.</td></tr>`;
            } else {
                tokens.forEach(token => { tableBody.appendChild(renderTableRow(token)); });
            }
        } catch (error) {
            console.error('Error fetching tokens:', error);
            tableBody.innerHTML = `<tr><td colspan="5" style="color: red; text-align: center;"><b>Error:</b> ${error.message}</td></tr>`;
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
        const id_mobil = document.getElementById('add-id-mobil').value;
        
        await apiRequest('add', { id_mobil });
        
        addForm.reset();
        button.disabled = false; button.textContent = 'Tambah Token';
        await fetchTokens();
    });

    // Jalankan semuanya
    fetchTokens();
});