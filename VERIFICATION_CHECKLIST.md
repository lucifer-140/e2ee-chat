# E2EE Chat App Verification Checklist

## Identity Management
- [x] **Create Identity**: User can generate a new identity with a passphrase. (Verified)
- [x] **Unlock Identity**: User can unlock their identity with the correct passphrase. (Verified)
- [x] **Persistence**: Identity persists after page reload. (Verified)

## Dashboard & UI
- [x] **Layout**: Dashboard loads correctly after unlock. (Verified)
- [x] **Navigation**: Can switch between chats/contacts/groups. (Verified)
- [x] **Responsiveness**: UI adapts to window resizing. (Verified)

## Contact Management
- [x] **Add Contact**: User can input a Public Key/ID to add a contact. (UI Verified)
- [ ] **View Contact**: Contact details are visible. (Not verified - no contacts added)
- [ ] **Delete Contact**: User can remove a contact. (Not verified)
- [ ] **Clear History**: User can clear message history for a contact. (Not verified)

## Messaging (1:1)
- [ ] **Send Message**: UI allows typing and sending a message. (Not verified - requires contact)
- [ ] **Receive Message**: Message appears in chat. (Not verified - requires 2nd client)
- [ ] **Encryption**: (Not verified)

## Group Messaging
- [x] **Create Group**: User can create a new group. (UI Verified - requires contacts to proceed)
- [ ] **Add Members**: User can add contacts to the group. (Not verified)
- [ ] **Broadcast**: User can send a message to the group. (Not verified)

## General/Stability
- [x] **Console Errors**: No critical errors in the browser console. (Verified)
- [x] **Performance**: App feels responsive. (Verified)
