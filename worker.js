export default {
  async fetch(request, env, ctx) {
    return new Response(await env.ASSETS.fetch(request))
  }
}
