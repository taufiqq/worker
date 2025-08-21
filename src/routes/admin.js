// src/routes/admin.js

export const handleAdminPage = async (c) => {
    try {
        // Langsung sajikan file dari ASSETS tanpa modifikasi
        return c.env.ASSETS.fetch(new URL('/adminn.html', c.req.url));
    } catch (e) {
        console.error("Error loading admin page:", e);
        return c.text('Gagal memuat halaman admin. Pastikan file admin.html ada di direktori /public.', 500);
    }
};