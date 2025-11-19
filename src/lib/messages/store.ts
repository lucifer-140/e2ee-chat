// src/lib/messages/store.ts
"use client";

export type MessageDirection = "out" | "in";

export interface StoredMessage {
  id: string;
  contactId?: string; // for 1:1
  groupId?: string;   // for groups
  sender?: string;    // for groups (who sent it)
  direction: MessageDirection;
  ciphertext?: string; // for 1:1
  plaintext?: string;  // for groups (stored as plaintext for now)
  nonce?: string;
  timestamp: string; // ISO string
}

const MESSAGES_KEY = "e2ee_messages_v1";

function loadAllMessages(): StoredMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(MESSAGES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StoredMessage[];
  } catch {
    return [];
  }
}

function saveAllMessages(msgs: StoredMessage[]) {
  if (typeof window !== "undefined") {
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(msgs));
  }
}

export function loadMessagesForContact(contactId: string): StoredMessage[] {
  return loadAllMessages().filter((m) => m.contactId === contactId);
}

export function loadMessagesForGroup(groupId: string): StoredMessage[] {
  return loadAllMessages().filter((m) => m.groupId === groupId);
}

export function addMessage(
  targetId: string,
  type: "direct" | "group",
  direction: MessageDirection,
  content: string, // ciphertext or plaintext
  nonce?: string,
  sender?: string
): StoredMessage {
  const all = loadAllMessages();
  const now = new Date().toISOString();

  const msg: StoredMessage = {
    id: crypto.randomUUID(),
    direction,
    timestamp: now,
  };

  if (type === "direct") {
    msg.contactId = targetId;
    msg.ciphertext = content;
    msg.nonce = nonce;
  } else {
    msg.groupId = targetId;
    msg.plaintext = content;
    msg.sender = sender;
  }

  const updated = [...all, msg];
  saveAllMessages(updated);

  return msg;
}

/** Existing helper (if you already had it) */
export function clearMessages() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(MESSAGES_KEY);
}

/** 🔥 NEW: delete all messages that belong to the given contacts */
export function deleteMessagesForContacts(contactIds: string[]) {
  if (typeof window === "undefined") return;

  const all = loadAllMessages();
  const set = new Set(contactIds);

  const filtered = all.filter((m) => !m.contactId || !set.has(m.contactId));
  saveAllMessages(filtered);
}

export function deleteMessagesForGroup(groupId: string) {
  if (typeof window === "undefined") return;
  const all = loadAllMessages();
  const filtered = all.filter((m) => m.groupId !== groupId);
  saveAllMessages(filtered);
}
