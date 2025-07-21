export default {
  fetch(request) {
    if (request.headers.get("upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const { socket, response } = Deno.upgradeWebSocket(request);

    socket.onopen = () => {
      console.log("Client connected");
      socket.send("Hello from Worker!");
    };

    socket.onmessage = (event) => {
      socket.send("Echo: " + event.data);
    };

    socket.onclose = () => {
      console.log("WebSocket closed");
    };

    socket.onerror = (err) => {
      console.error("WebSocket error", err);
    };

    return response;
  },
};
