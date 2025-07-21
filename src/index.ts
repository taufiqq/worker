export default {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const { socket, response } = Deno.upgradeWebSocket(request);

    socket.onopen = () => {
      console.log("Socket connected");
      socket.send("Hello from Worker!");
    };

    socket.onmessage = (event) => {
      console.log("Client says:", event.data);
      socket.send("Echo: " + event.data);
    };

    socket.onclose = () => console.log("Socket closed");
    socket.onerror = (e) => console.error("WebSocket error", e);

    return response;
  },
};
