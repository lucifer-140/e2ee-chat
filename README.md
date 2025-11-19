# E2EE Chat - Secure End-to-End Encrypted Messaging

A privacy-focused, end-to-end encrypted messaging application built with Next.js, featuring secure 1:1 and group chat capabilities using industry-standard cryptography.

## 🔐 Security Features

### Core Cryptography
- **libsodium**: All cryptographic operations use production-grade `libsodium-wrappers-sumo`
- **1:1 Messaging**: XChaCha20-Poly1305 AEAD encryption with Curve25519 key exchange
- **Group Messaging**: Signal Sender Keys protocol implementation
  - HKDF-based key derivation (HMAC-SHA256)
  - XChaCha20-Poly1305 AEAD for message encryption
  - Ed25519 signatures for message authentication
  - Forward secrecy through ratcheting chain keys

### Privacy Architecture
- **No Server-Side Storage**: All encryption keys remain in the browser
- **Passphrase-Protected Identity**: Keys encrypted with user passphrase before local storage
- **"Stranger" Group Support**: Secure communication between non-contacts via ad-hoc ECDH
- **No Auto-Contact Addition**: Group membership doesn't pollute contact lists
- **Dumb Relay Server**: Server only forwards encrypted messages, cannot decrypt

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ installed
- npm, yarn, pnpm, or bun package manager

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd e2ee-chat-clean
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the relay server** (in a separate terminal)
   ```bash
   node relay-server.js
   ```
   The relay server runs on `ws://localhost:4000`

4. **Start the development server**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser

5. **Test with multiple users**
   - Open multiple browser tabs or windows
   - Create a different identity in each tab
   - Exchange contact bundles or create groups to start chatting

## 📁 Project Structure

```
src/
├── app/
│   └── page.tsx              # Main chat interface and logic
├── lib/
│   ├── crypto/
│   │   ├── identity.ts       # Identity generation (Ed25519 keypairs)
│   │   └── session.ts        # 1:1 session key derivation and AEAD
│   ├── groups/
│   │   ├── groups.ts         # Group management and events
│   │   └── senderKeys.ts     # Signal Sender Keys implementation
│   └── storage/
│       ├── contacts.ts       # Contact management
│       ├── identity.ts       # Identity encryption/storage
│       └── messages.ts       # Message persistence
relay-server.js               # WebSocket relay (no decryption capability)
```

## 🔑 Key Concepts

### Identity
Each user creates a secure identity with:
- **Codename**: User-friendly identifier
- **Ed25519 Keypair**: For signing and key exchange
- **Passphrase**: Encrypts the secret key before browser storage

### Contacts (1:1 Chat)
- Exchange contact bundles (`e2ee-contact:v1:{codename,publicKey}`)
- Derive shared session key via Curve25519 ECDH
- All messages encrypted with XChaCha20-Poly1305

### Group Chat
- **Creator**: Broadcasts `group-event` with member list
- **Sender Keys**: Each member maintains their own sender key state
- **Key Distribution**: Sender key bundles encrypted individually for each recipient using ad-hoc ECDH
- **Message Flow**:
  1. Sender encrypts message with their chain key
  2. Sender distributes encrypted bundle to all members
  3. Recipients decrypt bundle, verify signature, decrypt message

## 🛡️ Security Guarantees

✅ **End-to-End Encryption**: Only sender and intended recipients can decrypt messages  
✅ **Forward Secrecy**: Compromised keys don't expose past messages (ratcheting)  
✅ **Message Authentication**: Ed25519 signatures prevent tampering  
✅ **Passphrase Protection**: Keys encrypted at rest in browser storage  
✅ **No Metadata Leakage**: Server sees only encrypted traffic  

## ⚠️ Security Considerations

- **Browser Storage**: Keys stored in `localStorage` (cleared on logout or browser data wipe)
- **Network**: Uses WebSocket relay - configure TLS/onion routing for production
- **No Message History Sync**: Messages only visible on the device where identity was unlocked
- **Group Key Management**: Members must be online to receive sender key updates

## 🎨 Features

- 🔒 Secure identity creation with passphrase protection
- 💬 1:1 end-to-end encrypted messaging
- 👥 Group chat with Signal Sender Keys
- 📱 QR code contact sharing
- 🎯 Message sender attribution in groups
- 🔍 Cryptographic fingerprint verification
- 🌙 Dark mode UI

## 🧪 Technology Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS v4
- **Cryptography**: libsodium-wrappers-sumo
- **Communication**: WebSocket (ws library)
- **Storage**: Browser LocalStorage (encrypted)

## 📝 Recent Updates

### Signal Sender Keys Implementation (Latest)
- Replaced placeholder cryptography with production-grade libsodium primitives
- Implemented secure key exchange for non-contacts via ad-hoc ECDH
- Fixed relay server to properly forward encrypted bundles
- Enhanced UI with sender attribution in group chats

## 🔬 Development

Build for production:
```bash
npm run build
```

Type checking:
```bash
npm run type-check
```

## 📄 License

[Your License Here]

## 🙏 Acknowledgments

Based on the Signal protocol's Sender Keys concept and modern cryptographic best practices.
