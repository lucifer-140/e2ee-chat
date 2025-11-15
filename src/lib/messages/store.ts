// src/lib/messages/store.ts
"use client";

export type MessageDirection = "out" | "in";

export interface StoredMessage {
  id: string;
  contactId: string;
  direction: MessageDirection;
  ciphertext: string;
  nonce: string;
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

export function addMessageForContact(
  contactId: string,
  direction: MessageDirection,
  ciphertext: string,
  nonce: string,
  timestamp: string
): StoredMessage {
  const all = loadAllMessages();

  const msg: StoredMessage = {
    id: crypto.randomUUID(),
    contactId,
    direction,
    ciphertext,
    nonce,
    timestamp,
  };

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

  const filtered = all.filter((m) => !set.has(m.contactId));
  saveAllMessages(filtered);
}
