const server = Bun.serve({
  port: process.env.PORT || 3000,
  fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ status: "ok", runtime: "bun" });
    }

    return Response.json({
      message: "Hello from Cairn!",
      deployed: true,
      timestamp: new Date().toISOString(),
    });
  },
});

console.log(`Server running on port ${server.port}`);
