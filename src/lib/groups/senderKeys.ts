// src/lib/groups/senderKeys.ts
import sodium from "libsodium-wrappers-sumo";

import { safeRandomId } from "@/lib/utils/id";

/**
 * On-disk state for a sender key in a given group.
 * For the local sender we keep signingSecretKey; for others we only keep pub + chainKey.
 */
export interface SenderKeyState {
  identityId: string;
  groupId: string;
  senderIdentityKey: string;  // identity public key (base64) of the sender
  signingPublicKey: string;   // Ed25519 pub (base64)
  signingSecretKey?: string;  // Ed25519 secret (base64) – only for self
  chainKey: string;           // current chain key (base64, 32 bytes)
  messageIndex: number;       // ratchet index
}

export interface SenderKeyBundlePayload {
  kind: "sender-key-bundle";
  groupId: string;
  senderIdentityKey: string;
  signingPublicKey: string;
  initialChainKey: string; // base64 32 bytes
}

export interface GroupMessagePacket {
  kind: "group-message";
  groupId: string;
  senderIdentityKey: string;
  signingPublicKey: string;
  messageIndex: number;
  nonce: string;       // base64
  ciphertext: string;  // base64
  signature: string;   // base64
}

// ─────────────────────────────────────────────
// Helpers: storage
// ─────────────────────────────────────────────

const STORAGE_KEY = "sender-key-states:v1";

function loadAllStates(): SenderKeyState[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SenderKeyState[];
  } catch {
    return [];
  }
}

function saveAllStates(states: SenderKeyState[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
  } catch (err) {
    console.warn("[senderKeys] failed to save states", err);
  }
}

function findState(
  identityId: string,
  groupId: string,
  senderIdentityKey: string
): SenderKeyState | undefined {
  const all = loadAllStates();
  return all.find(
    (s) =>
      s.identityId === identityId &&
      s.groupId === groupId &&
      s.senderIdentityKey === senderIdentityKey
  );
}

function upsertState(state: SenderKeyState) {
  const all = loadAllStates();
  const idx = all.findIndex(
    (s) =>
      s.identityId === state.identityId &&
      s.groupId === state.groupId &&
      s.senderIdentityKey === state.senderIdentityKey
  );
  if (idx >= 0) {
    all[idx] = state;
  } else {
    all.push(state);
  }
  saveAllStates(all);
}

// ─────────────────────────────────────────────
// Key derivation helpers
// ─────────────────────────────────────────────

async function ensureSodiumReady() {
  if ((sodium as any).ready) {
    await (sodium as any).ready;
  } else if (typeof (sodium as any).then === "function") {
    await sodium;
  }
}

/**
 * Very simple chain-key ratchet:
 *   nextChainKey = BLAKE2b(chainKey, "sender-key-chain")
 *   messageKey   = BLAKE2b(chainKey, "sender-key-msg")
 */
async function ratchetChainKey(
  chainKeyB64: string
): Promise<{ nextChainKeyB64: string; messageKey: Uint8Array }> {
  await ensureSodiumReady();
  const s = sodium as typeof import("libsodium-wrappers-sumo");

  const chainKey = s.from_base64(chainKeyB64, s.base64_variants.ORIGINAL);

  const nextChainKey = s.crypto_generichash(
    32,
    chainKey,
    s.from_string("sender-key-chain")
  );
  const messageKey = s.crypto_generichash(
    32,
    chainKey,
    s.from_string("sender-key-msg")
  );

  return {
    nextChainKeyB64: s.to_base64(
      nextChainKey,
      s.base64_variants.ORIGINAL
    ),
    messageKey,
  };
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Ensure the local identity has a SenderKeyState for itself in this group.
 * If it exists, returns it. Otherwise generates:
 *   - Ed25519 signing keypair
 *   - fresh chainKey
 */
export async function ensureSelfSenderKeyState(
  identityId: string,
  groupId: string,
  identityPublicKey: string
): Promise<SenderKeyState> {
  await ensureSodiumReady();
  const s = sodium as typeof import("libsodium-wrappers-sumo");

  const existing = findState(identityId, groupId, identityPublicKey);
  if (existing && existing.signingSecretKey) {
    return existing;
  }

  // Create new sender key state
  const keypair = s.crypto_sign_keypair(); // Ed25519
  const chainKeyBytes = s.randombytes_buf(32);

  const state: SenderKeyState = {
    identityId,
    groupId,
    senderIdentityKey: identityPublicKey,
    signingPublicKey: s.to_base64(
      keypair.publicKey,
      s.base64_variants.ORIGINAL
    ),
    signingSecretKey: s.to_base64(
      keypair.privateKey,
      s.base64_variants.ORIGINAL
    ),
    chainKey: s.to_base64(chainKeyBytes, s.base64_variants.ORIGINAL),
    messageIndex: 0,
  };

  upsertState(state);
  return state;
}

/**
 * Export a SenderKeyBundlePayload from the local sender state so it can be
 * encrypted (with pairwise sharedKey) and sent to group members.
 */
export function makeSenderKeyBundlePayload(
  selfState: SenderKeyState
): SenderKeyBundlePayload {
  return {
    kind: "sender-key-bundle",
    groupId: selfState.groupId,
    senderIdentityKey: selfState.senderIdentityKey,
    signingPublicKey: selfState.signingPublicKey,
    initialChainKey: selfState.chainKey,
  };
}

/**
 * Save a sender-key bundle we received from another member for this local identity.
 * If we already had a state for that sender/group, we only update if this looks "newer".
 */
export function saveSenderKeyBundle(
  identityId: string,
  payload: SenderKeyBundlePayload
) {
  const existing = findState(
    identityId,
    payload.groupId,
    payload.senderIdentityKey
  );

  // If we already have a chainKey and some progress, keep the existing one;
  // for now we just ignore "older" bundles.
  if (existing && existing.messageIndex > 0) {
    return;
  }

  const newState: SenderKeyState = {
    identityId,
    groupId: payload.groupId,
    senderIdentityKey: payload.senderIdentityKey,
    signingPublicKey: payload.signingPublicKey,
    chainKey: payload.initialChainKey,
    messageIndex: 0,
  };

  upsertState(newState);
}

/**
 * Encrypt a group message from the local sender using its SenderKeyState.
 * This:
 *   - ratchets the chain key
 *   - derives a message key
 *   - encrypts with crypto_secretbox
 *   - signs header+ciphertext with Ed25519
 *   - updates and persists the SenderKeyState
 */
export async function encryptGroupMessageFromSelf(
  identityId: string,
  groupId: string,
  identityPublicKey: string,
  plaintext: string
): Promise<{ packet: GroupMessagePacket }> {
  await ensureSodiumReady();
  const s = sodium as typeof import("libsodium-wrappers-sumo");

  const state = findState(identityId, groupId, identityPublicKey);
  if (!state || !state.signingSecretKey) {
    throw new Error(
      "[senderKeys] self sender key state missing or incomplete"
    );
  }

  const { nextChainKeyB64, messageKey } = await ratchetChainKey(
    state.chainKey
  );
  const newIndex = state.messageIndex + 1;

  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES);

  const ciphertext = s.crypto_secretbox_easy(
    s.from_string(plaintext),
    nonce,
    messageKey
  );

  // Build header: what gets signed
  const header = JSON.stringify({
    kind: "group-message",
    groupId,
    senderIdentityKey: identityPublicKey,
    signingPublicKey: state.signingPublicKey,
    messageIndex: newIndex,
  });

  const headerBytes = s.from_string(header);
  const toSign = new Uint8Array(
    headerBytes.length + ciphertext.length
  );
  toSign.set(headerBytes, 0);
  toSign.set(ciphertext, headerBytes.length);

  const sk = s.from_base64(
    state.signingSecretKey,
    s.base64_variants.ORIGINAL
  );
  const signature = s.crypto_sign_detached(toSign, sk);

  // Update state
  const updated: SenderKeyState = {
    ...state,
    chainKey: nextChainKeyB64,
    messageIndex: newIndex,
  };
  upsertState(updated);

  const packet: GroupMessagePacket = {
    kind: "group-message",
    groupId,
    senderIdentityKey: identityPublicKey,
    signingPublicKey: state.signingPublicKey,
    messageIndex: newIndex,
    nonce: s.to_base64(nonce, s.base64_variants.ORIGINAL),
    ciphertext: s.to_base64(
      ciphertext,
      s.base64_variants.ORIGINAL
    ),
    signature: s.to_base64(
      signature,
      s.base64_variants.ORIGINAL
    ),
  };

  return { packet };
}

/**
 * Decrypt a GroupMessagePacket for a local identity.
 * This:
 *   - finds/uses SenderKeyState for (groupId, senderIdentityKey)
 *   - verifies the Ed25519 signature
 *   - decrypts with chain-key-derived message key
 *   - ratchets the chainKey and updates state
 */
export async function decryptGroupMessageFromPacket(
  identityId: string,
  packet: GroupMessagePacket
): Promise<string | null> {
  await ensureSodiumReady();
  const s = sodium as typeof import("libsodium-wrappers-sumo");

  if (packet.kind !== "group-message") return null;

  const state = findState(
    identityId,
    packet.groupId,
    packet.senderIdentityKey
  );

  if (!state) {
    console.warn(
      "[senderKeys] no senderKeyState for group",
      packet.groupId,
      "sender",
      packet.senderIdentityKey.slice(0, 16)
    );
    return null;
  }

  // For simplicity, we assume in-order delivery; if packet.messageIndex
  // is <= state.messageIndex, we treat as duplicate and ignore.
  if (packet.messageIndex <= state.messageIndex) {
    console.warn(
      "[senderKeys] received stale group message index",
      packet.messageIndex,
      "state index",
      state.messageIndex
    );
    return null;
  }

  const { nextChainKeyB64, messageKey } = await ratchetChainKey(
    state.chainKey
  );

  const nonce = s.from_base64(
    packet.nonce,
    s.base64_variants.ORIGINAL
  );
  const ciphertext = s.from_base64(
    packet.ciphertext,
    s.base64_variants.ORIGINAL
  );
  const sig = s.from_base64(
    packet.signature,
    s.base64_variants.ORIGINAL
  );
  const pk = s.from_base64(
    packet.signingPublicKey,
    s.base64_variants.ORIGINAL
  );

  // Rebuild header to verify sig
  const header = JSON.stringify({
    kind: "group-message",
    groupId: packet.groupId,
    senderIdentityKey: packet.senderIdentityKey,
    signingPublicKey: packet.signingPublicKey,
    messageIndex: packet.messageIndex,
  });
  const headerBytes = s.from_string(header);
  const signedBytes = new Uint8Array(
    headerBytes.length + ciphertext.length
  );
  signedBytes.set(headerBytes, 0);
  signedBytes.set(ciphertext, headerBytes.length);

  const ok = s.crypto_sign_verify_detached(sig, signedBytes, pk);
  if (!ok) {
    console.warn("[senderKeys] invalid group message signature");
    return null;
  }

  let plaintextBytes: Uint8Array;
  try {
    plaintextBytes = s.crypto_secretbox_open_easy(
      ciphertext,
      nonce,
      messageKey
    );
  } catch {
    console.warn("[senderKeys] failed to decrypt group message");
    return null;
  }

  const updated: SenderKeyState = {
    ...state,
    chainKey: nextChainKeyB64,
    messageIndex: packet.messageIndex,
  };
  upsertState(updated);

  return s.to_string(plaintextBytes);
}
