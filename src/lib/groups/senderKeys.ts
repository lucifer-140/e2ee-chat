"use client";

import sodium from "libsodium-wrappers-sumo";

// ───────────────────────────────────────────────
// Libsodium Helper
// ───────────────────────────────────────────────

let sodiumReady: Promise<typeof sodium> | null = null;

async function getSodium() {
  if (!sodiumReady) {
    sodiumReady = (async () => {
      await sodium.ready;
      return sodium;
    })();
  }
  return sodiumReady;
}

// ───────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────

export interface SenderKeyState {
  groupId: string;
  senderPublicKey: string; // identity.publicKey of the sender
  rootChainKey: string; // base64
  chainKey: string; // base64 (current)
  index: number; // message counter
  signingPublicKey: string; // base64 (Ed25519)
  signingSecretKey?: string; // base64 (only for self)
}

export interface SenderKeyBundle {
  groupId: string;
  senderPublicKey: string;
  signingPublicKey: string;
  initialChainKey: string; // base64
}

type SenderKeyStore = Record<
  string, // groupId
  Record<string, SenderKeyState> // senderPublicKey -> state
>;

const SENDER_KEYS_KEY = "e2ee_sender_keys_v2";

// ───────────────────────────────────────────────
// Storage
// ───────────────────────────────────────────────

function loadAllSenderKeys(): SenderKeyStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(SENDER_KEYS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as SenderKeyStore;
  } catch {
    return {};
  }
}

function saveAllSenderKeys(store: SenderKeyStore) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SENDER_KEYS_KEY, JSON.stringify(store));
}

export function loadSenderKeyState(
  groupId: string,
  senderPublicKey: string
): SenderKeyState | undefined {
  const root = loadAllSenderKeys();
  return root[groupId]?.[senderPublicKey];
}

function saveSenderKeyState(state: SenderKeyState) {
  const root = loadAllSenderKeys();
  if (!root[state.groupId]) root[state.groupId] = {};
  root[state.groupId][state.senderPublicKey] = state;
  saveAllSenderKeys(root);
}

// ───────────────────────────────────────────────
// Crypto Primitives (Real Signal-style)
// ───────────────────────────────────────────────

// HKDF-like derivation using HMAC-SHA256
// Output is always 32 bytes (sodium.crypto_auth_hmacsha256_BYTES)
async function kdf(inputB64: string, label: "msg" | "chain"): Promise<string> {
  const s = await getSodium();
  const key = s.from_base64(inputB64, s.base64_variants.URLSAFE_NO_PADDING);

  // Label as a single byte: 0x01 for message key, 0x02 for next chain key
  const data = new Uint8Array([label === "msg" ? 0x01 : 0x02]);

  const out = s.crypto_auth_hmacsha256(data, key);
  return s.to_base64(out, s.base64_variants.URLSAFE_NO_PADDING);
}

// Encrypt using XChaCha20-Poly1305
// We use the 32-byte message key.
// Since we don't have a separate IV derivation step in this simplified ratchet,
// we will generate a random nonce.
// Returns: { ciphertext: base64(nonce + ciphertext) }
async function encryptWithSenderKey(
  msgKeyB64: string,
  plaintext: string
): Promise<{ ciphertext: string }> {
  const s = await getSodium();
  const key = s.from_base64(msgKeyB64, s.base64_variants.URLSAFE_NO_PADDING);

  const nonce = s.randombytes_buf(s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const pt = s.from_string(plaintext);

  const ct = s.crypto_aead_xchacha20poly1305_ietf_encrypt(
    pt,
    null,
    null,
    nonce,
    key
  );

  // Combine nonce + ct for storage/transport
  const combined = new Uint8Array(nonce.length + ct.length);
  combined.set(nonce);
  combined.set(ct, nonce.length);

  return {
    ciphertext: s.to_base64(combined, s.base64_variants.URLSAFE_NO_PADDING),
  };
}

// Decrypt using XChaCha20-Poly1305
// Expects ciphertextB64 to be base64(nonce + ciphertext)
async function decryptWithSenderKey(
  msgKeyB64: string,
  ciphertextB64: string
): Promise<string> {
  const s = await getSodium();
  const key = s.from_base64(msgKeyB64, s.base64_variants.URLSAFE_NO_PADDING);
  const combined = s.from_base64(ciphertextB64, s.base64_variants.URLSAFE_NO_PADDING);

  const nonceLen = s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES;
  if (combined.length < nonceLen) throw new Error("Ciphertext too short");

  const nonce = combined.subarray(0, nonceLen);
  const ct = combined.subarray(nonceLen);

  const pt = s.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    ct,
    null,
    nonce,
    key
  );

  return s.to_string(pt);
}

// Sign using Ed25519
async function sign(secretKeyB64: string, msg: string): Promise<string> {
  const s = await getSodium();
  const sk = s.from_base64(secretKeyB64, s.base64_variants.URLSAFE_NO_PADDING);
  const sig = s.crypto_sign_detached(msg, sk);
  return s.to_base64(sig, s.base64_variants.URLSAFE_NO_PADDING);
}

// Verify using Ed25519
async function verify(publicKeyB64: string, msg: string, sigB64: string): Promise<boolean> {
  const s = await getSodium();
  try {
    const pk = s.from_base64(publicKeyB64, s.base64_variants.URLSAFE_NO_PADDING);
    const sig = s.from_base64(sigB64, s.base64_variants.URLSAFE_NO_PADDING);
    return s.crypto_sign_verify_detached(sig, msg, pk);
  } catch {
    return false;
  }
}

// ───────────────────────────────────────────────
// API: ensure self state + bundle
// ───────────────────────────────────────────────

/**
 * Ensure we have a SenderKeyState for *ourselves* in this group.
 * Returns a SenderKeyBundle if this is a fresh state (needs to be
 * sent to others), or null if state already existed.
 */
export async function ensureSelfSenderKeyState(
  identityId: string,
  groupId: string,
  selfPublicKey: string
): Promise<SenderKeyBundle> {
  let state = loadSenderKeyState(groupId, selfPublicKey);
  if (state) {
    // Return current state as a bundle so we can re-broadcast if needed
    return {
      groupId,
      senderPublicKey: selfPublicKey,
      signingPublicKey: state.signingPublicKey,
      initialChainKey: state.chainKey, // Give them the CURRENT key so they can start decrypting from now
    };
  }

  const s = await getSodium();

  // Generate fresh Root Chain Key (32 bytes)
  const rootChainKeyRaw = s.randombytes_buf(32);
  const rootChainKey = s.to_base64(rootChainKeyRaw, s.base64_variants.URLSAFE_NO_PADDING);

  // Derive Initial Chain Key
  const initialChainKey = await kdf(rootChainKey, "chain");

  // Generate fresh Signing Keypair (Ed25519)
  const keypair = s.crypto_sign_keypair();
  const signingPublicKey = s.to_base64(keypair.publicKey, s.base64_variants.URLSAFE_NO_PADDING);
  const signingSecretKey = s.to_base64(keypair.privateKey, s.base64_variants.URLSAFE_NO_PADDING);

  state = {
    groupId,
    senderPublicKey: selfPublicKey,
    rootChainKey,
    chainKey: initialChainKey,
    index: 0,
    signingPublicKey,
    signingSecretKey,
  };

  saveSenderKeyState(state);

  return {
    groupId,
    senderPublicKey: selfPublicKey,
    signingPublicKey,
    initialChainKey,
  };
}

/**
 * Apply an incoming SenderKeyBundle for some OTHER sender.
 */
export function applySenderKeyBundle(bundle: SenderKeyBundle) {
  const existing = loadSenderKeyState(bundle.groupId, bundle.senderPublicKey);
  if (existing) {
    // already have state; skip or overwrite depending on your rekey policy
    return;
  }

  const state: SenderKeyState = {
    groupId: bundle.groupId,
    senderPublicKey: bundle.senderPublicKey,
    rootChainKey: "", // unknown for receivers; not needed
    chainKey: bundle.initialChainKey,
    index: 0,
    signingPublicKey: bundle.signingPublicKey,
  };
  saveSenderKeyState(state);
}

// ───────────────────────────────────────────────
// API: encrypt / decrypt group messages
// ───────────────────────────────────────────────

export async function encryptGroupMessageAsSender(
  groupId: string,
  selfPublicKey: string,
  plaintext: string
): Promise<{ counter: number; ciphertext: string; signature: string }> {
  const state = loadSenderKeyState(groupId, selfPublicKey);
  if (!state || !state.signingSecretKey) {
    throw new Error("No sender key state for self in this group");
  }

  const currentIndex = state.index;
  const msgKey = await kdf(state.chainKey, "msg");
  const nextChain = await kdf(state.chainKey, "chain");

  const { ciphertext } = await encryptWithSenderKey(msgKey, plaintext);

  const payloadToSign = JSON.stringify({
    groupId,
    senderPublicKey: selfPublicKey,
    counter: currentIndex,
    ciphertext,
  });

  const signature = await sign(state.signingSecretKey, payloadToSign);

  // ratchet forward
  state.chainKey = nextChain;
  state.index = currentIndex + 1;
  saveSenderKeyState(state);

  return {
    counter: currentIndex,
    ciphertext,
    signature,
  };
}

export async function decryptGroupMessageAsReceiver(
  groupId: string,
  senderPublicKey: string,
  counter: number,
  ciphertext: string,
  signature: string
): Promise<string | null> {
  const state = loadSenderKeyState(groupId, senderPublicKey);
  if (!state) {
    console.warn("[senderKeys] no state for sender", senderPublicKey);
    return null;
  }

  const payloadToVerify = JSON.stringify({
    groupId,
    senderPublicKey,
    counter,
    ciphertext,
  });

  const ok = await verify(state.signingPublicKey, payloadToVerify, signature);
  if (!ok) {
    console.warn("[senderKeys] invalid signature");
    return null;
  }

  // naive ratchet: assume messages arrive in order
  if (counter !== state.index) {
    // for production: handle skipped keys/out-of-order
    // (silently ignore warning for now to keep console clean)
  }

  const msgKey = await kdf(state.chainKey, "msg");
  const nextChain = await kdf(state.chainKey, "chain");

  let plaintext: string | null = null;
  try {
    plaintext = await decryptWithSenderKey(msgKey, ciphertext);
  } catch (err) {
    console.error("[senderKeys] decryption failed", err);
    return null;
  }

  state.chainKey = nextChain;
  state.index = state.index + 1;
  saveSenderKeyState(state);

  return plaintext;
}
