// src/lib/contacts/store.ts
"use client";

import { deriveSessionKey } from "@/lib/crypto/session";

export interface Contact {
  id: string;
  codename: string;
  publicKey: string; // base64
  sharedKey?: string; // derived locally
}

type ContactsByIdentity = Record<string, Contact[]>;

const CONTACTS_KEY = "e2ee_contacts_v2";

function loadAllContacts(): ContactsByIdentity {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(CONTACTS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ContactsByIdentity;
  } catch {
    return {};
  }
}

function saveAllContacts(root: ContactsByIdentity) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(root));
}

export function loadContacts(identityId: string): Contact[] {
  const root = loadAllContacts();
  return root[identityId] ?? [];
}

export function saveContacts(identityId: string, contacts: Contact[]) {
  const root = loadAllContacts();
  root[identityId] = contacts;
  saveAllContacts(root);
}

/**
 * Idempotent add:
 * - For this identityId, if a contact with the same publicKey exists,
 *   it is updated (codename/sharedKey).
 * - If none exists, a new contact is created.
 */
export async function addContact(
  identityId: string,
  mySecretKeyB64: string,
  codename: string,
  theirPublicKey: string
): Promise<Contact> {
  const shared = await deriveSessionKey(mySecretKeyB64, theirPublicKey);

  const root = loadAllContacts();
  const existingList = root[identityId] ?? [];

  // Check if we already know this publicKey for this identity
  const idx = existingList.findIndex((c) => c.publicKey === theirPublicKey);

  if (idx !== -1) {
    // Update existing contact instead of creating a duplicate
    const existing = existingList[idx];

    const updated: Contact = {
      ...existing,
      codename: codename || existing.codename, // prefer new codename if provided
      publicKey: theirPublicKey,
      sharedKey: shared.key,
    };

    const newList = [...existingList];
    newList[idx] = updated;

    root[identityId] = newList;
    saveAllContacts(root);

    return updated;
  }

  // No existing contact with this publicKey → create a new one
  const newContact: Contact = {
    id: crypto.randomUUID(),
    codename,
    publicKey: theirPublicKey,
    sharedKey: shared.key,
  };

  root[identityId] = [...existingList, newContact];
  saveAllContacts(root);

  return newContact;
}

/** delete all contacts for this identity and return them */
export function deleteContactsForIdentity(identityId: string): Contact[] {
  const root = loadAllContacts();
  const contacts = root[identityId] ?? [];
  delete root[identityId];
  saveAllContacts(root);
  return contacts;
}

export function deleteContact(identityId: string, contactId: string) {
  const root = loadAllContacts();
  const contacts = root[identityId] ?? [];
  const filtered = contacts.filter((c) => c.id !== contactId);
  root[identityId] = filtered;
  saveAllContacts(root);
}


/**
 * One-time cleanup: remove duplicates per (identityId, publicKey).
 * If multiple contacts share the same publicKey, they are merged,
 * and only one contact is kept.
 */
export function dedupeAllContacts() {
  const root = loadAllContacts();
  const newRoot: ContactsByIdentity = {};

  for (const [identityId, contacts] of Object.entries(root)) {
    const byPublicKey = new Map<string, Contact>();

    for (const c of contacts) {
      const existing = byPublicKey.get(c.publicKey);
      if (!existing) {
        byPublicKey.set(c.publicKey, c);
        continue;
      }

      // Merge rule: last one wins, but keep a stable id
      const merged: Contact = {
        ...existing,
        ...c,
        id: existing.id,
      };

      byPublicKey.set(c.publicKey, merged);
    }

    newRoot[identityId] = Array.from(byPublicKey.values());
  }

  saveAllContacts(newRoot);
}
