// src/routes/adminApi.js (Diperbarui untuk D1)

import { Hono } from 'hono';
import { adminAuth } from '../middleware/adminAuth.js';
import { generateSecureToken } from '../utils/generateToken.js';

const adminApi = new Hono();

// Terapkan auth ke semua rute di dalam file ini
adminApi.use('/token', adminAuth); 

// GET: Mengambil semua token dari D1
adminApi.get('/token', async (c) => {
    try {
        const ps = c.env.DB.prepare(
            'SELECT token, id, user, pass, id_mobil, claimed_by_ip FROM tokens ORDER BY id ASC'
        );
        const { results } = await ps.all();

        // Transformasi data agar cocok dengan format yang diharapkan frontend { key, value }
        const formattedResults = results.map(row => ({
            key: row.token,
            value: {
                id: row.id,
                user: row.user,
                pass: row.pass,
                id_mobil: row.id_mobil,
                claimed_by_ip: row.claimed_by_ip // Kirim info klaim, bisa berguna di UI
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
                const { user, pass, id_mobil } = body;
                if (!user || !pass || id_mobil === undefined) {
                    return c.json({ message: 'User, Pass, dan ID Mobil harus diisi' }, 400);
                }

                // Cari ID maksimum untuk membuat ID berikutnya
                const { results } = await c.env.DB.prepare('SELECT MAX(id) as maxId FROM tokens').all();
                const newId = (results[0].maxId || 0) + 1;
                const newToken = generateSecureToken();
                
                const ps = c.env.DB.prepare(
                    'INSERT INTO tokens (token, id, user, pass, id_mobil) VALUES (?, ?, ?, ?, ?)'
                );
                await ps.bind(newToken, newId, user, pass, parseInt(id_mobil, 10)).run();
                break;
            }
            case 'update': {
                const { user, pass, id, id_mobil } = body;
                 if (!user || !pass || id_mobil === undefined || !token_key) {
                    return c.json({ message: 'Data tidak lengkap untuk update' }, 400);
                }
                const ps = c.env.DB.prepare(
                    'UPDATE tokens SET user = ?, pass = ?, id_mobil = ? WHERE token = ?'
                );
                await ps.bind(user, pass, parseInt(id_mobil, 10), token_key).run();
                break;
            }
            case 'generate_new': {
                const oldTokenData = await c.env.DB.prepare('SELECT user FROM tokens WHERE token = ?').bind(token_key).first();
                if (oldTokenData) {
                    const newToken = generateSecureToken();
                    const ps = c.env.DB.prepare('UPDATE tokens SET token = ?, claimed_by_ip = NULL, claimed_at = NULL WHERE token = ?');
                    await ps.bind(newToken, token_key).run();
                    responseData.kickedUser = oldTokenData.user;
                }
                break;
            }
            case 'delete': {
                 const oldTokenData = await c.env.DB.prepare('SELECT user FROM tokens WHERE token = ?').bind(token_key).first();
                if (oldTokenData) {
                    await c.env.DB.prepare('DELETE FROM tokens WHERE token = ?').bind(token_key).run();
                    responseData.kickedUser = oldTokenData.user;
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