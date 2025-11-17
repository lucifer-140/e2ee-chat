// relay-server.js
// Very simple E2EE-friendly WebSocket relay.
// It never sees plaintext, only small JSON envelopes.

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
  console.log(
    `[relay] Registered connection for ${publicKey.slice(0, 16)}… (total=${set.size})`
  );
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
      console.log(
        `[relay] Connection closed for ${pub.slice(0, 16)}… remaining=${set.size}`
      );
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

    // ─────────────────────────
    // 1) Registration
    // ─────────────────────────
    if (msg.type === "register" && typeof msg.publicKey === "string") {
      registerConnection(msg.publicKey, ws);
      return;
    }

    // ─────────────────────────
    // 2) Direct / group messages
    //    { type: "message", from, to, ciphertext, nonce, timestamp, groupId? }
    // ─────────────────────────
    if (msg.type === "message") {
      const { from, to, ciphertext, nonce, timestamp, groupId } = msg;
      if (typeof to !== "string" || typeof from !== "string") return;

      const recSet = connections.get(to);
      if (!recSet || recSet.size === 0) {
        console.log(
          `[relay] Recipient offline for ${to.slice(0, 16)}…, msg dropped`
        );
        return;
      }

      const payload = JSON.stringify({
        type: "message",
        from,
        ciphertext,
        nonce,
        timestamp,
        // groupId is optional – keep it if present
        ...(groupId ? { groupId } : {}),
      });

      for (const client of recSet) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      }

      console.log(
        `[relay] Forwarded message ${from.slice(0, 16)}… -> ${to.slice(0, 16)}…` +
          (groupId ? ` (groupId=${groupId})` : "")
      );
      return;
    }

    // ─────────────────────────
    // 3) Group events
    //    { type: "group-event", from, to: string | string[], event }
    // ─────────────────────────
    if (msg.type === "group-event") {
      const { from, to, event } = msg;
      if (typeof from !== "string") return;

      // `to` can be a single publicKey or an array of publicKeys
      const recipients = Array.isArray(to) ? to : [to];

      const payload = JSON.stringify({
        type: "group-event",
        from,
        event,
      });

      let deliveredCount = 0;

      for (const pk of recipients) {
        if (typeof pk !== "string") continue;
        const recSet = connections.get(pk);
        if (!recSet || recSet.size === 0) {
          console.log(
            `[relay] group-event for ${pk.slice(0, 16)}… – no active connections`
          );
          continue;
        }
        for (const client of recSet) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
            deliveredCount++;
          }
        }
      }

      console.log(
        `[relay] Forwarded group-event '${event?.type}' from ${from.slice(
          0,
          16
        )}… to ${recipients.length} recipient(s), delivered=${deliveredCount}`
      );
      return;
    }

    // Any unknown message type gets ignored
    console.log("[relay] Unknown msg type:", msg.type);
  });

  ws.on("close", () => {
    unregisterConnection(ws);
  });

  ws.on("error", (err) => {
    console.warn("[relay] socket error", err);
    unregisterConnection(ws);
  });
});
