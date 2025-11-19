# E2EE Chat (Clean & Secure)

A secure, end-to-end encrypted (E2EE) chat application built with Next.js, React 19, and `libsodium`. Designed for privacy, it features a zero-knowledge relay server and robust client-side encryption for both direct and group messaging.

## 🚀 Features

*   **End-to-End Encryption**: All messages are encrypted on the device before sending. The server never sees plaintext.
*   **Secure Identity**: Identities are generated locally using Ed25519 keys and protected by a passphrase. Keys never leave your browser.
*   **1:1 Messaging**: Secure direct chats using XChaCha20-Poly1305 and ECDH key exchange.
*   **Group Messaging**: Scalable, secure group chats using Signal-style "Sender Keys" protocol.
*   **Zero-Knowledge Server**: The relay server is "dumb" and stateless. It only forwards encrypted blobs and handles basic routing.
*   **Group Management**:
    *   Create private groups.
    *   Add members (Admin only).
    *   Kick members (Admin only).
    *   Leave groups.
    *   Real-time membership updates.
*   **Persistence**:
    *   Encrypted local storage for identities and keys.
    *   Local message history (cleared on logout/leave/kick).
*   **Modern UI**: Built with Tailwind CSS v4, featuring a dark, hacker-aesthetic interface.

## 🛡️ Security Architecture

This project prioritizes security and privacy:

### Cryptography
*   **Library**: `libsodium-wrappers-sumo` (WebAssembly).
*   **Identity**: Ed25519 key pairs for signing and identification.
*   **Key Exchange**: X25519 (Curve25519) for ECDH shared secret derivation.
*   **Encryption**: XChaCha20-Poly1305 (AEAD) for message encryption.
*   **Hashing**: BLAKE2b for key derivation (HKDF-like usage).

### Protocol
1.  **1:1 Chats**:
    *   Users exchange public keys via a secure side-channel (e.g., QR code or manual entry).
    *   Shared session keys are derived using ECDH (Sender's Secret + Recipient's Public).
    *   Messages are encrypted with unique nonces.

2.  **Group Chats (Sender Keys)**:
    *   Each member generates a random 32-byte **Chain Key**.
    *   This Chain Key is distributed to other members via 1:1 encrypted channels (Sender Key Bundle).
    *   Messages are encrypted using a **Message Key** derived from the Chain Key.
    *   The Chain Key ratchets forward after every message (Forward Secrecy).
    *   When membership changes (leave/kick), keys are rotated to ensure future secrecy.

## 🛠️ Prerequisites

*   **Node.js**: v18 or higher.
*   **npm** or **pnpm**.

## 📦 Installation

1.  **Clone the repository**:
    ```bash
    git clone <repository-url>
    cd e2ee-chat-clean
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    # or
    pnpm install
    ```

## 🏃‍♂️ Running the Application

You need to run both the relay server and the client application.

1.  **Start the Relay Server** (Terminal 1):
    ```bash
    node relay-server.js
    ```
    *Runs on `ws://localhost:4000`*

2.  **Start the Client** (Terminal 2):
    ```bash
    npm run dev
    ```
    *Runs on `http://localhost:3000`*

## 📖 Usage Guide

### 1. Create an Identity
*   Open the app.
*   Enter a **Codename** (public alias) and a strong **Passphrase**.
*   Your secure identity is created and stored in your browser's Local Storage.

### 2. Add Contacts
*   Share your **Public Key** or **Contact Bundle** (found in the sidebar) with a friend.
*   Click **"+ ADD CONTACT"**.
*   Enter their Codename and paste their Public Key/Bundle.
*   Once added, you can start a secure 1:1 chat.

### 3. Create a Group
*   Click **"+ NEW GROUP"**.
*   Enter a Group Name.
*   Select the contacts you want to include.
*   Click "CREATE GROUP".

### 4. Manage Groups
*   **Add Member**: Open Group Info -> Click "+ ADD MEMBER" (Creator only).
*   **Kick Member**: Open Group Info -> Click "KICK" next to a member's name (Creator only).
*   **Leave Group**: Open Group Info -> Click "LEAVE GROUP".
    *   *Note: Leaving or being kicked will delete your local chat history for that group.*

## 📂 Project Structure

*   `src/app/page.tsx`: Main application logic (UI, State, WebSocket handling).
*   `src/lib/crypto/`: Core cryptographic wrappers (session keys, fingerprinting).
*   `src/lib/groups/`: Group management logic (store, sender keys protocol).
*   `src/lib/identities/`: Identity management (creation, unlocking, storage).
*   `src/lib/messages/`: Message storage and persistence.
*   `relay-server.js`: The WebSocket relay server.

## ⚠️ Disclaimer

This project is for **educational purposes**. While it uses production-grade cryptographic primitives (`libsodium`), it has not undergone a formal security audit. Use at your own risk for sensitive communications.
