// lib/groups/senderKeys.ts

import { encryptMessage, decryptMessage } from "@/lib/crypto/session";
import { safeRandomId } from "@/lib/utils/id";

const STORAGE_KEY = "e2ee.senderKeys.v1";

export interface SenderKeyRecord {
  id: string;             // keyId
  identityId: string;     // which local identity owns this record
  groupId: string;        // which group
  ownerPublicKey: string; // whose messages this key encrypts
  keyB64: string;         // URL-safe, no-padding base64 32-byte key
  createdAt: string;
}

function loadAllSenderKeys(): SenderKeyRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SenderKeyRecord[];
  } catch {
    return [];
  }
}

function saveAllSenderKeys(records: SenderKeyRecord[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // ignore
  }
}

/**
 * Encode to the same format libsodium expects for your existing shared keys:
 * URL-safe base64, NO padding.
 * i.e. "+" -> "-", "/" -> "_", then strip "=".
 */
function toUrlSafeBase64(u8: Uint8Array): string {
  // browser-safe path
  let binary = "";
  for (let i = 0; i < u8.length; i++) {
    binary += String.fromCharCode(u8[i]);
  }
  const base64 = btoa(binary); // standard base64: + / and maybe =
  return base64
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, ""); // remove padding
}

/**
 * Ensure we have a sender key for (identityId, groupId, myPublicKey).
 * Sender key is stored as URL-safe base64 string.
 */
export async function ensureSelfSenderKeyState(
  identityId: string,
  groupId: string,
  myPublicKey: string
): Promise<{ record: SenderKeyRecord }> {
  const all = loadAllSenderKeys();

  let rec = all.find(
    (r) =>
      r.identityId === identityId &&
      r.groupId === groupId &&
      r.ownerPublicKey === myPublicKey
  );

  if (!rec) {
    const rawKey = crypto.getRandomValues(new Uint8Array(32));
    const keyB64 = toUrlSafeBase64(rawKey);

    rec = {
      id: safeRandomId(),
      identityId,
      groupId,
      ownerPublicKey: myPublicKey,
      keyB64,
      createdAt: new Date().toISOString(),
    };

    all.push(rec);
    saveAllSenderKeys(all);
  }

  return { record: rec };
}

/**
 * Called when we receive a sender-key packet from another member.
 * We persist their sender key locally.
 */
export function saveSenderKeyFromPacket(
  identityId: string,
  groupId: string,
  ownerPublicKey: string,
  keyId: string,
  keyB64: string
): SenderKeyRecord {
  const all = loadAllSenderKeys();

  let rec = all.find(
    (r) =>
      r.identityId === identityId &&
      r.groupId === groupId &&
      r.ownerPublicKey === ownerPublicKey &&
      r.id === keyId
  );

  if (!rec) {
    rec = {
      id: keyId,
      identityId,
      groupId,
      ownerPublicKey,
      keyB64,
      createdAt: new Date().toISOString(),
    };
    all.push(rec);
  } else {
    // update key if we got a newer one
    rec.keyB64 = keyB64;
  }

  saveAllSenderKeys(all);
  return rec;
}

/**
 * Encrypt a group message using *my* sender key.
 * We treat record.keyB64 exactly like your existing sharedKey string
 * and just pass it into encryptMessage.
 */
export async function encryptGroupMessageFromSelf(
  identityId: string,
  groupId: string,
  myPublicKey: string,
  plaintext: string
): Promise<{ ciphertext: string; nonce: string; keyId: string }> {
  const { record } = await ensureSelfSenderKeyState(
    identityId,
    groupId,
    myPublicKey
  );

  const { ciphertext, nonce } = await encryptMessage(record.keyB64, plaintext);

  return {
    ciphertext,
    nonce,
    keyId: record.id,
  };
}

/**
 * Decrypt a group message using the stored sender key for (group, sender, keyId).
 */
export async function decryptGroupMessageFromPacket(
  identityId: string,
  groupId: string,
  ownerPublicKey: string,
  keyId: string,
  ciphertext: string,
  nonce: string
): Promise<string> {
  const all = loadAllSenderKeys();

  const rec = all.find(
    (r) =>
      r.identityId === identityId &&
      r.groupId === groupId &&
      r.ownerPublicKey === ownerPublicKey &&
      r.id === keyId
  );

  if (!rec) {
    throw new Error(
      "[senderKeys] Missing sender key for this group / sender / keyId"
    );
  }

  // keyB64 already in the URL-safe format encryptMessage/decryptMessage expect
  return await decryptMessage(rec.keyB64, nonce, ciphertext);
}
