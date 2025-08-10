// src/routes/admin.js

export const handleAdminPage = async (c) => {
    try {
        const asset = await c.env.ASSETS.fetch(new URL('/adminn.html', c.req.url));
        let html = await asset.text();
        const mqtt = await c.env.ADMIN.get('MQTT', 'json');
        
        const injectionScript = `<script>window.ADMIN_MQTT_CREDS = ${JSON.stringify(mqtt)};</script>`;
        html = html.replace('</body>', `${injectionScript}</body>`);
        
        const response = new Response(html, asset);
        response.headers.set('Content-Type', 'text/html;charset=UTF-8');
        return response;
    } catch (e) {
        console.error("Error loading admin page:", e);
        return c.text('Gagal memuat halaman admin. Pastikan file admin.html ada di direktori /public.', 500);
    }
};