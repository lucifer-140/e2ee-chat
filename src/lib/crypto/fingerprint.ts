// src/lib/crypto/fingerprint.ts
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

/**
 * Compute a short, human-checkable fingerprint from a public key.
 * Input: base64 (URLSAFE_NO_PADDING) public key
 * Output: e.g. "A3F9-1C0D-72B4-9E11"
 */
export async function getPublicKeyFingerprint(
  publicKeyB64: string
): Promise<string> {
  const s = await getSodium();

  // decode base64 (URLSAFE_NO_PADDING) -> bytes
  const bytes = s.from_base64(
    publicKeyB64,
    s.base64_variants.URLSAFE_NO_PADDING
  );

  // SHA-256 hash of the public key
  const hash = s.crypto_hash_sha256(bytes); // Uint8Array (32 bytes)

  // Take first 8 bytes (64 bits) for a short fingerprint
  const slice = hash.slice(0, 8);

  // Convert to hex
  let hex = "";
  for (const b of slice) {
    hex += b.toString(16).padStart(2, "0");
  }

  // Group as XXXX-XXXX-XXXX-XXXX
  const grouped =
    hex.slice(0, 4) +
    "-" +
    hex.slice(4, 8) +
    "-" +
    hex.slice(8, 12) +
    "-" +
    hex.slice(12, 16);

  return grouped.toUpperCase();
}
