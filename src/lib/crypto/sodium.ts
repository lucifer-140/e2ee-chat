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

// --- 1:1 Encryption (from session.ts) ---

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

// --- Group Sender Keys ---

const SENDER_KEY_PREFIX = "sk:";

interface SenderKeyState {
    chainKey: string; // base64
    sigKeyPair?: {
        publicKey: string; // base64
        privateKey: string; // base64
    };
    sigPub?: string; // base64 (for imported keys)
    counter: number;
}

function getStorageKey(groupId: string, publicKey: string) {
    return `${SENDER_KEY_PREFIX}${groupId}:${publicKey}`;
}

export async function ensureSenderKey(
    groupId: string,
    myPublicKey: string,
    myCodename: string
) {
    const s = await getSodium();
    const key = getStorageKey(groupId, myPublicKey);
    const raw = localStorage.getItem(key);

    if (raw) {
        const state = JSON.parse(raw) as SenderKeyState;
        // Return public bundle
        return {
            groupId,
            senderCodename: myCodename,
            senderKeyState: {
                chainKey: state.chainKey,
                sigPub: state.sigKeyPair?.publicKey,
            },
        };
    }

    // Generate new
    const chainKey = s.randombytes_buf(32);
    const sigKeyPair = s.crypto_sign_keypair();

    const state: SenderKeyState = {
        chainKey: s.to_base64(chainKey, s.base64_variants.URLSAFE_NO_PADDING),
        sigKeyPair: {
            publicKey: s.to_base64(sigKeyPair.publicKey, s.base64_variants.URLSAFE_NO_PADDING),
            privateKey: s.to_base64(sigKeyPair.privateKey, s.base64_variants.URLSAFE_NO_PADDING),
        },
        counter: 0,
    };

    localStorage.setItem(key, JSON.stringify(state));

    return {
        groupId,
        senderCodename: myCodename,
        senderKeyState: {
            chainKey: state.chainKey,
            sigPub: state.sigKeyPair!.publicKey,
        },
    };
}

export async function getSenderKeyState(groupId: string, myPublicKey: string) {
    // Helper if needed, but ensureSenderKey does the job
    return ensureSenderKey(groupId, myPublicKey, "Unknown");
}

export async function importSenderKeyState(
    groupId: string,
    senderPublicKey: string,
    publicState: { chainKey: string; sigPub: string }
) {
    const key = getStorageKey(groupId, senderPublicKey);

    // We only store what we need to decrypt/verify
    const state: SenderKeyState = {
        chainKey: publicState.chainKey,
        sigPub: publicState.sigPub,
        counter: 0,
    };

    localStorage.setItem(key, JSON.stringify(state));
}

export async function encryptGroupMessageAsSender(
    groupId: string,
    myPublicKey: string,
    plaintext: string
) {
    const s = await getSodium();
    const key = getStorageKey(groupId, myPublicKey);
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error("No sender key found");

    const state = JSON.parse(raw) as SenderKeyState;
    if (!state.sigKeyPair) throw new Error("No signing key in sender state");

    // 1. Encrypt
    // For simplicity, we use XChaCha20-Poly1305 with a random nonce for each message
    // derived from the Chain Key? Or just use the Chain Key as the key?
    // Real Sender Keys derive per-message keys.
    // Here we will use Chain Key as the encryption key directly (simplified)
    // and random nonce.

    const chainKey = s.from_base64(state.chainKey, s.base64_variants.URLSAFE_NO_PADDING);
    const nonce = s.randombytes_buf(s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);

    const ciphertext = s.crypto_aead_xchacha20poly1305_ietf_encrypt(
        plaintext,
        null,
        null,
        nonce,
        chainKey
    );

    const ciphertextB64 = s.to_base64(ciphertext, s.base64_variants.URLSAFE_NO_PADDING);
    const nonceB64 = s.to_base64(nonce, s.base64_variants.URLSAFE_NO_PADDING);

    // 2. Sign (Ciphertext + Nonce + Counter?)
    // Let's sign the ciphertext
    const sigSecret = s.from_base64(state.sigKeyPair.privateKey, s.base64_variants.URLSAFE_NO_PADDING);
    const signature = s.crypto_sign_detached(ciphertext, sigSecret);
    const signatureB64 = s.to_base64(signature, s.base64_variants.URLSAFE_NO_PADDING);

    // 3. Update state (counter)
    state.counter++;
    localStorage.setItem(key, JSON.stringify(state));

    // We pack nonce into ciphertext or return it?
    // ChatShell expects { counter, ciphertext, signature }
    // It doesn't expect nonce?
    // Wait, ChatShell sends:
    // ciphertext, nonce: null, counter, signature

    // So we must pack nonce into ciphertext OR ChatShell needs to handle nonce.
    // ChatShell line 543: `nonce: null`.
    // So the receiver must know the nonce or it's attached.
    // Let's prepend nonce to ciphertext.

    const combined = new Uint8Array(nonce.length + ciphertext.length);
    combined.set(nonce);
    combined.set(ciphertext, nonce.length);
    const combinedB64 = s.to_base64(combined, s.base64_variants.URLSAFE_NO_PADDING);

    return {
        counter: state.counter,
        ciphertext: combinedB64,
        signature: signatureB64,
    };
}

export async function decryptGroupMessageAsSender(
    groupId: string,
    senderPublicKey: string,
    ciphertextB64: string,
    counter: number,
    signatureB64: string
) {
    const s = await getSodium();
    const key = getStorageKey(groupId, senderPublicKey);
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error("No sender key found for " + senderPublicKey);

    const state = JSON.parse(raw) as SenderKeyState;
    if (!state.sigPub) throw new Error("No signing key for " + senderPublicKey);

    const combined = s.from_base64(ciphertextB64, s.base64_variants.URLSAFE_NO_PADDING);

    // Extract nonce
    const nonceLen = s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES;
    if (combined.length < nonceLen) throw new Error("Invalid message length");

    const nonce = combined.subarray(0, nonceLen);
    const ciphertext = combined.subarray(nonceLen);

    // 1. Verify Signature (on ciphertext only? or combined?)
    // We signed ciphertext (raw) in encrypt.
    // But here we have ciphertext extracted.
    // Let's verify signature on `ciphertext` (the encrypted part).

    const sigPub = s.from_base64(state.sigPub, s.base64_variants.URLSAFE_NO_PADDING);
    const signature = s.from_base64(signatureB64, s.base64_variants.URLSAFE_NO_PADDING);

    const valid = s.crypto_sign_verify_detached(signature, ciphertext, sigPub);
    if (!valid) throw new Error("Invalid signature");

    // 2. Decrypt
    const chainKey = s.from_base64(state.chainKey, s.base64_variants.URLSAFE_NO_PADDING);

    const plaintext = s.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        ciphertext,
        null,
        nonce,
        chainKey
    );

    return s.to_string(plaintext);
}
