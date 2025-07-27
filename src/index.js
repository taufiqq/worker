export default {
    async fetch(request, env, ctx) {
        try {
            // Coba untuk menyajikan aset statis langsung dari direktori yang diupload.
            // env.ASSETS.fetch secara otomatis menangani header, caching, dan MIME type.
            return await env.ASSETS.fetch(request);
        } catch (e) {
            // Jika env.ASSETS.fetch melempar error (biasanya karena file tidak ada),
            // kita akan menyajikan index.html sebagai fallback untuk routing SPA.
            // Ini memungkinkan rute seperti /about atau /user/123 untuk berfungsi.
            // Ambil file index.html dari aset kita.
            return await env.ASSETS.fetch(new Request(new URL('/index.html', request.url)));
        }
    }
};