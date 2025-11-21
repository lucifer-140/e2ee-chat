# Suggested Improvements & Upgrades

Based on the technical report and application verification, here are the recommended upgrades:

## 1. Security Enhancements
- **Forward Secrecy (Double Ratchet)**: Currently, the app uses long-term identity keys. Implementing the Double Ratchet algorithm would ensure that even if a key is compromised, past messages remain secure.
- **Key Rotation**: Mechanism to rotate identity keys periodically or on-demand.

## 2. Functional Upgrades
- **Offline Messaging**: Implement a "Store-and-Forward" mechanism on the relay server (encrypted) so users can receive messages sent while they were offline.
- **File Sharing**: Add support for sending encrypted files/images.
- **Multi-Device Support**: Allow syncing identity and chat history across multiple devices (e.g., via QR code pairing).

## 3. UI/UX Improvements
- **Empty States**: Improve the "Create Group" experience when no contacts exist. Instead of just blocking, guide the user to add a contact first.
- **Settings Accessibility**: Move "View Full Profile" to a dedicated "Settings" gear icon for better discoverability.
- **Onboarding**: Add a "Copy Public Key" button prominently on the empty dashboard to encourage sharing.
- **Visual Feedback**: Add toast notifications for successful actions (e.g., "Contact Added", "Group Created").

## 4. Technical/Infrastructure
- **Server Persistence**: Optionally allow the server to store encrypted history for a limited time (configurable retention policy).
- **PWA Support**: Make the app installable as a Progressive Web App (PWA) for better mobile experience.
