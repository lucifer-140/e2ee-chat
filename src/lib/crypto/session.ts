// src/lib/crypto/session.ts
"use client";

import sodium from "libsodium-wrappers-sumo";

let ready: Promise<typeof sodium> | null = null;

async function getSodium() {
  if (!ready) {
    ready = (async () => {
      await sodium.ready;
      return sodium;
    })();
  }
  return ready;
}

export interface DerivedSessionKey {
  key: string;        // base64
  theirPublicKey: string;
}

export async function deriveSessionKey(
  mySecretKeyB64: string,
  theirPublicKeyB64: string
): Promise<DerivedSessionKey> {
  const s = await getSodium();

  const mySecret = s.from_base64(
    mySecretKeyB64,
    s.base64_variants.URLSAFE_NO_PADDING
  );

  const theirPub = s.from_base64(
    theirPublicKeyB64,
    s.base64_variants.URLSAFE_NO_PADDING
  );

  const shared = s.crypto_box_beforenm(theirPub, mySecret);

  const sharedB64 = s.to_base64(
    shared,
    s.base64_variants.URLSAFE_NO_PADDING
  );

  return {
    key: sharedB64,
    theirPublicKey: theirPublicKeyB64,
  };
}

export async function encryptMessage(
  sharedKeyB64: string,
  plaintext: string
): Promise<{
  ciphertext: string;
  nonce: string;
}> {
  const s = await getSodium();

  const sharedKey = s.from_base64(
    sharedKeyB64,
    s.base64_variants.URLSAFE_NO_PADDING
  );

  const nonce = s.randombytes_buf(
    s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
  );

  const ciphertext = s.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext,
    null,
    null,
    nonce,
    sharedKey
  );

  return {
    ciphertext: s.to_base64(
      ciphertext,
      s.base64_variants.URLSAFE_NO_PADDING
    ),
    nonce: s.to_base64(nonce, s.base64_variants.URLSAFE_NO_PADDING),
  };
}

export async function decryptMessage(
  sharedKeyB64: string,
  nonceB64: string,
  ciphertextB64: string
): Promise<string> {
  const s = await getSodium();

  const sharedKey = s.from_base64(
    sharedKeyB64,
    s.base64_variants.URLSAFE_NO_PADDING
  );

  const nonce = s.from_base64(
    nonceB64,
    s.base64_variants.URLSAFE_NO_PADDING
  );

  const ciphertext = s.from_base64(
    ciphertextB64,
    s.base64_variants.URLSAFE_NO_PADDING
  );

  const plaintext = s.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    ciphertext,
    null,
    nonce,
    sharedKey
  );

  return s.to_string(plaintext);
}
