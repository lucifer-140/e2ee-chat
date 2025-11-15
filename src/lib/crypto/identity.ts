// src/lib/crypto/identity.ts
"use client";

import sodium from "libsodium-wrappers-sumo";

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

export interface CryptoIdentity {
  codename: string;
  publicKey: string; // base64 (URLSAFE)
  secretKey: string; // base64 (URLSAFE) - keep only on client
}

export async function generateCryptoIdentity(
  codename: string
): Promise<CryptoIdentity> {
  const s = await getSodium();

  const { publicKey, privateKey } = s.crypto_box_keypair();

  const publicKeyB64 = s.to_base64(
    publicKey,
    s.base64_variants.URLSAFE_NO_PADDING
  );
  const secretKeyB64 = s.to_base64(
    privateKey,
    s.base64_variants.URLSAFE_NO_PADDING
  );

  return {
    codename,
    publicKey: publicKeyB64,
    secretKey: secretKeyB64,
  };
}
