// src/routes/adminApi.js (Diperbarui untuk D1, tanpa user/pass, dengan logika kick)

import { Hono } from 'hono';
import { adminAuth } from '../middleware/adminAuth.js';
import { generateSecureToken } from '../utils/generateToken.js';

const adminApi = new Hono();

// Fungsi helper untuk mengirim sinyal kick ke Durable Object
const kickCarSession = async (c, id_mobil) => {
    if (!id_mobil) return;
    try {
        // ID Durable Object harus berupa string
        const doId = c.env.CAR_SESSION.idFromName(id_mobil.toString());
        const doStub = c.env.CAR_SESSION.get(doId);
        
        // Kirim request POST sederhana ke DO untuk memicu kick.
        // URL tidak harus ada, yang penting method-nya.
        await doStub.fetch('https://do/kick', { method: 'POST' });
        console.log(`Kick signal sent to CarSession for id_mobil: ${id_mobil}`);
    } catch (e) {
        console.error(`Failed to send kick signal for id_mobil ${id_mobil}:`, e);
    }
};

// Terapkan auth ke semua rute di dalam file ini
adminApi.use('/token', adminAuth); 

// GET: Mengambil semua token dari D1 (Tidak ada perubahan di sini)
adminApi.get('/token', async (c) => {
    try {
        const ps = c.env.DB.prepare(
            'SELECT token, id, id_mobil, claimed_by_ip FROM tokens ORDER BY id ASC'
        );
        const { results } = await ps.all();
        const formattedResults = results.map(row => ({
            key: row.token,
            value: {
                id: row.id,
                id_mobil: row.id_mobil,
                claimed_by_ip: row.claimed_by_ip
            }
        }));
        return c.json(formattedResults);
    } catch (e) {
        console.error("D1 Select Error:", e);
        return c.json({ message: 'Gagal mengambil data dari database: ' + e.message }, 500);
    }
});

// POST: Mengelola token (add, update, delete, dll.)
adminApi.post('/token', async (c) => {
    try {
        const body = await c.req.json();
        const { action, token_key } = body;
        let responseData = { success: true, action };

        switch (action) {
            case 'add': {
                const { id_mobil } = body;
                if (id_mobil === undefined) {
                    return c.json({ message: 'ID Mobil harus diisi' }, 400);
                }
                const { results } = await c.env.DB.prepare('SELECT MAX(id) as maxId FROM tokens').all();
                const newId = (results[0].maxId || 0) + 1;
                const newToken = generateSecureToken();
                const ps = c.env.DB.prepare('INSERT INTO tokens (token, id, id_mobil) VALUES (?, ?, ?)');
                await ps.bind(newToken, newId, parseInt(id_mobil, 10)).run();
                break;
            }
            case 'update': {
                const { id_mobil } = body;
                 if (id_mobil === undefined || !token_key) {
                    return c.json({ message: 'Data tidak lengkap untuk update' }, 400);
                }
                const ps = c.env.DB.prepare('UPDATE tokens SET id_mobil = ? WHERE token = ?');
                await ps.bind(parseInt(id_mobil, 10), token_key).run();
                break;
            }
            case 'generate_new': {
                const tokenData = await c.env.DB.prepare('SELECT id_mobil FROM tokens WHERE token = ?').bind(token_key).first();
                if (tokenData) {
                    // KIRIM SINYAL KICK SEBELUM MENGUBAH TOKEN
                    await kickCarSession(c, tokenData.id_mobil);

                    const newToken = generateSecureToken();
                    const ps = c.env.DB.prepare('UPDATE tokens SET token = ?, claimed_by_ip = NULL, claimed_at = NULL WHERE token = ?');
                    await ps.bind(newToken, token_key).run();
                }
                break;
            }
            case 'delete': {
                const tokenData = await c.env.DB.prepare('SELECT id_mobil FROM tokens WHERE token = ?').bind(token_key).first();
                if (tokenData) {
                    // KIRIM SINYAL KICK SEBELUM MENGHAPUS TOKEN
                    await kickCarSession(c, tokenData.id_mobil);

                    await c.env.DB.prepare('DELETE FROM tokens WHERE token = ?').bind(token_key).run();
                }
                break;
            }
            default: return c.json({ message: 'Aksi tidak valid' }, 400);
        }
        return c.json(responseData);
    } catch (e) {
        console.error("Admin API D1 Error:", e);
        return c.json({ message: 'Internal Server Error: ' + e.message }, 500);
    }
});

export default adminApi;