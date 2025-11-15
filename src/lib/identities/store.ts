// src/lib/identities/store.ts
"use client";

import sodium from "libsodium-wrappers-sumo";
import { safeRandomId } from "@/lib/utils/id";
import {
  CryptoIdentity,
  generateCryptoIdentity,
} from "@/lib/crypto/identity";

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

export interface IdentityKdfParams {
  salt: string;       // base64
  opsLimit: number;
  memLimit: number;
  algo: "argon2id";
}

export interface StoredIdentity {
  id: string;
  codename: string;
  publicKey: string;

  // secret key is NOT stored directly:
  encryptedSecretKey: string; // base64 ciphertext
  nonce: string;              // base64 nonce
  kdf: IdentityKdfParams;

  createdAt: string;
  lastActiveAt: string;
}

export interface UnlockedIdentity extends StoredIdentity {
  secretKey: string; // base64, only kept in memory
}

const IDS_KEY = "e2ee_identities_v1";
const ACTIVE_ID_KEY = "e2ee_active_identity_v1";

// ---------------- storage helpers ----------------

function loadAllIdentities(): StoredIdentity[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(IDS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StoredIdentity[];
  } catch {
    return [];
  }
}

function saveAllIdentities(ids: StoredIdentity[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(IDS_KEY, JSON.stringify(ids));
}

export function loadIdentities(): StoredIdentity[] {
  return loadAllIdentities();
}

export function getActiveIdentityId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_ID_KEY);
}

export function setActiveIdentityId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) {
    window.localStorage.setItem(ACTIVE_ID_KEY, id);
  } else {
    window.localStorage.removeItem(ACTIVE_ID_KEY);
  }
}

export function updateIdentityLastActive(id: string) {
  const all = loadAllIdentities();
  const idx = all.findIndex((i) => i.id === id);
  if (idx === -1) return;
  all[idx] = {
    ...all[idx],
    lastActiveAt: new Date().toISOString(),
  };
  saveAllIdentities(all);
}

export function deleteIdentity(id: string) {
  const all = loadAllIdentities();
  const filtered = all.filter((i) => i.id !== id);
  saveAllIdentities(filtered);

  const activeId = getActiveIdentityId();
  if (activeId === id) {
    setActiveIdentityId(null);
  }
}

// ---------------- crypto helpers ----------------

async function encryptSecretKeyWithPassphrase(
  secretKeyB64: string,
  passphrase: string
): Promise<{
  encryptedSecretKey: string;
  nonce: string;
  kdf: IdentityKdfParams;
}> {
  const s = await getSodium();

  const salt = s.randombytes_buf(s.crypto_pwhash_SALTBYTES);
  const opsLimit = s.crypto_pwhash_OPSLIMIT_INTERACTIVE;
  const memLimit = s.crypto_pwhash_MEMLIMIT_INTERACTIVE;

  const key = s.crypto_pwhash(
    s.crypto_secretbox_KEYBYTES,
    passphrase,
    salt,
    opsLimit,
    memLimit,
    s.crypto_pwhash_ALG_ARGON2ID13
  );

  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES);

  const secretKeyBytes = s.from_base64(
    secretKeyB64,
    s.base64_variants.URLSAFE_NO_PADDING
  );

  const cipher = s.crypto_secretbox_easy(secretKeyBytes, nonce, key);

  return {
    encryptedSecretKey: s.to_base64(
      cipher,
      s.base64_variants.URLSAFE_NO_PADDING
    ),
    nonce: s.to_base64(nonce, s.base64_variants.URLSAFE_NO_PADDING),
    kdf: {
      salt: s.to_base64(salt, s.base64_variants.URLSAFE_NO_PADDING),
      opsLimit,
      memLimit,
      algo: "argon2id",
    },
  };
}

async function decryptSecretKeyWithPassphrase(
  stored: StoredIdentity,
  passphrase: string
): Promise<string> {
  const s = await getSodium();

  const salt = s.from_base64(
    stored.kdf.salt,
    s.base64_variants.URLSAFE_NO_PADDING
  );

  const key = s.crypto_pwhash(
    s.crypto_secretbox_KEYBYTES,
    passphrase,
    salt,
    stored.kdf.opsLimit,
    stored.kdf.memLimit,
    s.crypto_pwhash_ALG_ARGON2ID13
  );

  const nonce = s.from_base64(
    stored.nonce,
    s.base64_variants.URLSAFE_NO_PADDING
  );

  const cipher = s.from_base64(
    stored.encryptedSecretKey,
    s.base64_variants.URLSAFE_NO_PADDING
  );

  const plainBytes = s.crypto_secretbox_open_easy(cipher, nonce, key);

  if (!plainBytes) {
    throw new Error("Invalid passphrase or corrupted data");
  }

  const secretKeyB64 = s.to_base64(
    plainBytes,
    s.base64_variants.URLSAFE_NO_PADDING
  );

  return secretKeyB64;
}

// ---------------- public API ----------------

export async function createIdentity(
  codename: string,
  passphrase: string
): Promise<UnlockedIdentity> {
  const base: CryptoIdentity = await generateCryptoIdentity(codename);
  const now = new Date().toISOString();

  const { encryptedSecretKey, nonce, kdf } =
    await encryptSecretKeyWithPassphrase(base.secretKey, passphrase);

  const stored: StoredIdentity = {
    id: safeRandomId(),
    codename,
    publicKey: base.publicKey,
    encryptedSecretKey,
    nonce,
    kdf,
    createdAt: now,
    lastActiveAt: now,
  };

  const existing = loadAllIdentities();
  const updated = [...existing, stored];
  saveAllIdentities(updated);
  setActiveIdentityId(stored.id);

  return {
    ...stored,
    secretKey: base.secretKey,
  };
}

export async function unlockIdentity(
  stored: StoredIdentity,
  passphrase: string
): Promise<UnlockedIdentity> {
  const secretKey = await decryptSecretKeyWithPassphrase(
    stored,
    passphrase
  );

  return {
    ...stored,
    secretKey,
  };
}
