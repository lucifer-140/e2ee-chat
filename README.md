# E2EE Chat Application

A secure end‑to‑end encrypted chat built with **Next.js**, **React**, and **libsodium**. The app supports one‑to‑one and group messaging with strong cryptographic primitives (XChaCha20‑Poly1305, HKDF, Ed25519).

## Features

- **Secure Messaging**: All messages are encrypted client‑side using libsodium.
- **Signal‑style Sender Keys**: Group messages use per‑group sender keys for forward secrecy.
- **Dynamic Group UI**: Messages from different senders are displayed in separate bubbles with the sender's codename.
- **Add Contacts from Group Chat**: Users can add unknown group members as contacts directly from the chat UI, turning the placeholder `Member‑XXXX` into the real codename.
- **No Automatic Contact Creation**: Contacts are only added explicitly by the user.
- **Responsive Design**: Modern UI with dark mode, glassmorphism‑style components, and micro‑animations.

## Getting Started

1. **Install dependencies**
   ```bash
   npm install
   # or yarn, pnpm, bun
   ```
2. **Run the development server**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

- Create a new identity (codename + passphrase) on the landing screen.
- Add contacts manually via the **Add Contact** modal or directly from a group chat.
- Create a group, select members, and start chatting securely.
- Messages show the sender's codename above each bubble; unknown members appear as `Member‑<key>` until added as contacts.

## Development

- **Core crypto** lives in `src/lib/groups/senderKeys.ts`.
- UI components are in `src/app/page.tsx`.
- The WebSocket relay server (`relay-server.js`) forwards encrypted messages.

## Deploy

Deploy to Vercel or any Node.js hosting platform. Ensure the environment variable `NEXT_PUBLIC_RELAY_WS_URL` points to your WebSocket relay.

---

*This README reflects the latest implementation, including group chat UI improvements and the ability to add contacts from within a group chat.*
