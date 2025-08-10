// src/middleware/adminAuth.js

export const adminAuth = async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Basic ')) {
        return c.newResponse('Autentikasi diperlukan.', 401, { 'WWW-Authenticate': 'Basic realm="Admin Area"' });
    }
    try {
        const decodedCreds = atob(authHeader.substring(6));
        const [user, pass] = decodedCreds.split(':');
        const adminData = await c.env.ADMIN.get(`admin:${user}`, 'json');

        if (!adminData || adminData.pass !== pass) {
            return c.newResponse('Username atau password salah.', 401, { 'WWW-Authenticate': 'Basic realm="Admin Area"' });
        }
    } catch (e) {
        return c.newResponse('Format autentikasi tidak valid.', 400);
    }
    // Jika berhasil, lanjutkan ke handler berikutnya
    await next();
};