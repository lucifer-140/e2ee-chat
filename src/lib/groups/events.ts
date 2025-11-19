// src/lib/groups/events.ts

export interface GroupEvent {
  type: "create" | "add" | "remove" | "rename" | "leave";
  groupId: string;
  version: number;
  name?: string;
  members?: string[];
  target?: string; // used for add/remove/leave
}

/**
 * Broadcast a group event via the relay.
 * The relay should fan this out to all `to` recipients.
 */
export function broadcastGroupEvent(
  ws: WebSocket | null,
  fromPublicKey: string,
  memberPublicKeys: string[],
  event: GroupEvent
) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn("[group-event] WS offline, event not broadcast");
    return;
  }

  ws.send(
    JSON.stringify({
      type: "group-event",
      from: fromPublicKey,
      to: memberPublicKeys,
      event,
    })
  );
}
