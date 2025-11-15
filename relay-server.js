// relay-server.js
// Very simple E2EE-friendly WebSocket relay.
// It never sees plaintext, only { from, to, ciphertext, nonce, timestamp }.

const WebSocket = require("ws");

const PORT = 4000;

// Map: publicKey (string) -> Set<WebSocket>
const connections = new Map();

/**
 * Register a connection under a public key
 */
function registerConnection(publicKey, ws) {
  let set = connections.get(publicKey);
  if (!set) {
    set = new Set();
    connections.set(publicKey, set);
  }
  set.add(ws);
  console.log(`[relay] Registered connection for ${publicKey.slice(0, 16)}… (total=${set.size})`);
}

/**
 * Remove a connection from all publicKey sets
 */
function unregisterConnection(ws) {
  for (const [pub, set] of connections.entries()) {
    if (set.has(ws)) {
      set.delete(ws);
      if (set.size === 0) {
        connections.delete(pub);
      }
      console.log(`[relay] Connection closed for ${pub.slice(0, 16)}… remaining=${set.size}`);
    }
  }
}

const wss = new WebSocket.Server({ port: PORT }, () => {
  console.log(`[relay] WebSocket relay listening on ws://localhost:${PORT}`);
});

wss.on("connection", (ws) => {
  console.log("[relay] Incoming connection");

  ws.on("message", (msgBuffer) => {
    let msg;
    try {
      msg = JSON.parse(msgBuffer.toString("utf8"));
    } catch (err) {
      console.warn("[relay] Failed to parse message:", err);
      return;
    }

    if (msg.type === "register" && typeof msg.publicKey === "string") {
      registerConnection(msg.publicKey, ws);
      return;
    }

    if (msg.type === "message") {
      const { from, to, ciphertext, nonce, timestamp } = msg;
      if (typeof to !== "string" || typeof from !== "string") return;

      const recSet = connections.get(to);
      if (!recSet || recSet.size === 0) {
        // recipient offline (for now we just drop; you can later add persistence/queue)
        console.log(
          `[relay] Recipient offline for ${to.slice(0, 16)}…, msg dropped`
        );
        return;
      }

      // Forward to all sockets registered for this recipient
      const payload = JSON.stringify({
        type: "message",
        from,
        ciphertext,
        nonce,
        timestamp,
      });

      for (const client of recSet) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      }

      console.log(
        `[relay] Forwarded message ${from.slice(0, 16)}… -> ${to.slice(0, 16)}…`
      );
    }
  });

  ws.on("close", () => {
    unregisterConnection(ws);
  });

  ws.on("error", (err) => {
    console.warn("[relay] socket error", err);
    unregisterConnection(ws);
  });
});
