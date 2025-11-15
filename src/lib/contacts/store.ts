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

export async function addContact(
  identityId: string,
  mySecretKeyB64: string,
  codename: string,
  theirPublicKey: string
): Promise<Contact> {
  const shared = await deriveSessionKey(mySecretKeyB64, theirPublicKey);

  const newContact: Contact = {
    id: crypto.randomUUID(),
    codename,
    publicKey: theirPublicKey,
    sharedKey: shared.key,
  };

  const existing = loadContacts(identityId);
  const updated = [...existing, newContact];
  saveContacts(identityId, updated);

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
