// src/app/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Menu, X, Lock, Send } from "lucide-react";
import { getPublicKeyFingerprint } from "@/lib/crypto/fingerprint";


import {
  StoredIdentity,
  UnlockedIdentity,
  loadIdentities,
  createIdentity,
  getActiveIdentityId,
  setActiveIdentityId,
  updateIdentityLastActive,
  deleteIdentity,
  unlockIdentity,
} from "@/lib/identities/store";

import {
  Contact,
  addContact,
  loadContacts,
  deleteContactsForIdentity,
} from "@/lib/contacts/store";

import {
  loadMessagesForContact,
  addMessageForContact,
  deleteMessagesForContacts,
  StoredMessage,
} from "@/lib/messages/store";

import {
  decryptMessage,
  encryptMessage,
} from "@/lib/crypto/session";

// For UI
interface DecryptedMessage {
  id: string;
  direction: "out" | "in";
  plaintext: string;
  timestamp: string;
}

// ---------- Create Identity Screen (with passphrase) ----------

function IdentityCreateScreen({
  onCreated,
  onBackToVaultIfAny,
  hasExisting,
}: {
  onCreated: (id: UnlockedIdentity) => void;
  onBackToVaultIfAny: () => void;
  hasExisting: boolean;
}) {
  const [codename, setCodename] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cn = codename.trim();
    if (!cn) {
      setError("Codename is required");
      return;
    }
    if (pass.length < 8) {
      setError("Passphrase should be at least 8 characters");
      return;
    }
    if (pass !== pass2) {
      setError("Passphrase confirmation does not match");
      return;
    }

    setLoading(true);
    try {
      const identity = await createIdentity(cn, pass);
      onCreated(identity);
    } catch (err) {
      console.error(err);
      setError("Failed to create identity");
    } finally {
      setLoading(false);
    }
  };

  const generateCodename = () => {
    const animals = ["fox", "raven", "owl", "wolf", "panther", "coyote"];
    const adj = ["neon", "shadow", "void", "silent", "ghost", "midnight"];
    const a = adj[Math.floor(Math.random() * adj.length)];
    const b = animals[Math.floor(Math.random() * animals.length)];
    const num = Math.floor(Math.random() * 900 + 100);
    setCodename(`${a}-${b}-${num}`);
  };

  return (
    <div className="flex h-screen items-center justify-center bg-black text-white">
      <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-lg">
        <div className="mb-4 flex items-center gap-2">
          <Lock className="h-5 w-5 text-cyan-400" />
          <h1 className="text-sm font-semibold tracking-[0.25em] text-cyan-400">
            E2EE NODE
          </h1>
        </div>
        <h2 className="mb-2 text-lg font-semibold">
          Create a new identity
        </h2>
        <p className="mb-4 text-sm text-zinc-400">
          This identity will be protected by your passphrase. Secret keys
          are stored encrypted in this browser.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">
              Codename
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={codename}
                onChange={(e) => setCodename(e.target.value)}
                placeholder="e.g. neon-fox-314"
                className="flex-1 rounded-md border border-zinc-700 bg-black px-3 py-2 text-sm outline-none focus:border-cyan-400"
              />
              <button
                type="button"
                onClick={generateCodename}
                className="rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-300 hover:border-cyan-400 hover:text-cyan-300"
              >
                Random
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">
              Passphrase
            </label>
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-black px-3 py-2 text-sm outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">
              Confirm passphrase
            </label>
            <input
              type="password"
              value={pass2}
              onChange={(e) => setPass2(e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-black px-3 py-2 text-sm outline-none focus:border-cyan-400"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-cyan-500 px-3 py-2 text-sm font-medium text-black hover:bg-cyan-400 disabled:opacity-60"
          >
            {loading ? (
              <span>Creating identity…</span>
            ) : (
              <>
                <Lock className="h-4 w-4" />
                <span>Create identity</span>
              </>
            )}
          </button>
        </form>
        {hasExisting && (
          <button
            onClick={onBackToVaultIfAny}
            className="mt-4 w-full text-xs text-zinc-400 hover:text-zinc-200"
          >
            Back to identity vault
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- Unlock Identity Screen ----------

function UnlockIdentityScreen({
  identity,
  onUnlocked,
  onCancel,
}: {
  identity: StoredIdentity;
  onUnlocked: (id: UnlockedIdentity) => void;
  onCancel: () => void;
}) {
  const [pass, setPass] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!pass) {
      setError("Passphrase required");
      return;
    }
    setLoading(true);
    try {
      const unlocked = await unlockIdentity(identity, pass);
      onUnlocked(unlocked);
    } catch (err) {
      console.error(err);
      setError("Invalid passphrase or corrupted identity");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-black text-white">
      <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-lg">
        <div className="mb-4 flex items-center gap-2">
          <Lock className="h-5 w-5 text-cyan-400" />
          <h1 className="text-sm font-semibold tracking-[0.25em] text-cyan-400">
            UNLOCK IDENTITY
          </h1>
        </div>
        <h2 className="mb-2 text-lg font-semibold">
          {identity.codename}
        </h2>
        <p className="mb-4 text-sm text-zinc-400">
          Enter the passphrase to unlock this identity. Secret keys never
          leave this browser.
        </p>

        <form onSubmit={handleUnlock} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">
              Passphrase
            </label>
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-black px-3 py-2 text-sm outline-none focus:border-cyan-400"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="w-1/3 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-300 hover:border-zinc-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="w-2/3 rounded-md bg-cyan-500 px-3 py-2 text-sm font-medium text-black hover:bg-cyan-400 disabled:opacity-60"
            >
              {loading ? "Unlocking…" : "Unlock"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Identity Vault Screen ----------

function IdentityVault({
  identities,
  onActivate,
  onCreateNew,
  onDelete,
}: {
  identities: StoredIdentity[];
  onActivate: (id: StoredIdentity) => void;
  onCreateNew: () => void;
  onDelete: (id: StoredIdentity) => void;
}) {
  return (
    <div className="flex h-screen items-center justify-center bg-black text-white">
      <div className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-lg">
        <div className="mb-4 flex items-center gap-2">
          <Lock className="h-5 w-5 text-cyan-400" />
          <h1 className="text-sm font-semibold tracking-[0.25em] text-cyan-400">
            IDENTITY VAULT
          </h1>
        </div>
        <h2 className="mb-2 text-lg font-semibold">
          Choose an identity
        </h2>
        <p className="mb-4 text-sm text-zinc-400">
          Each identity has its own keys, contacts, and encrypted messages
          in this browser profile.
        </p>

        {identities.length === 0 && (
          <p className="text-sm text-zinc-500 mb-4">
            No identities yet. Create your first identity to start.
          </p>
        )}

        <div className="space-y-2 max-h-72 overflow-y-auto mb-4">
          {identities.map((id) => (
            <div
              key={id.id}
              className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2"
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {id.codename}
                </span>
                <span className="text-[10px] text-zinc-500 break-all">
                  {id.publicKey}
                </span>
                <span className="text-[10px] text-zinc-600 mt-1">
                  Last active:{" "}
                  {id.lastActiveAt
                    ? new Date(id.lastActiveAt).toLocaleString()
                    : "never"}
                </span>
              </div>
              <div className="flex flex-col gap-1 ml-2">
                <button
                  onClick={() => onActivate(id)}
                  className="rounded-md border border-cyan-500 px-3 py-1 text-xs text-cyan-300 hover:bg-cyan-500 hover:text-black"
                >
                  Activate
                </button>
                <button
                  onClick={() => onDelete(id)}
                  className="rounded-md border border-red-600 px-3 py-1 text-xs text-red-400 hover:bg-red-600 hover:text-black"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={onCreateNew}
          className="w-full rounded-md bg-cyan-500 px-3 py-2 text-sm font-medium text-black hover:bg-cyan-400"
        >
          + Create new identity
        </button>
      </div>
    </div>
  );
}

// ---------- Add Contact Modal ----------

function AddContactModal({
  identity,
  onClose,
  onAdded,
}: {
  identity: UnlockedIdentity;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [codename, setCodename] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!codename.trim() || !publicKey.trim()) return;
    setLoading(true);
    try {
      await addContact(
        identity.id,
        identity.secretKey,
        codename.trim(),
        publicKey.trim()
      );
      onAdded();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-lg p-6">
        <h2 className="text-lg font-medium mb-4 text-white">
          Add Contact
        </h2>

        <label className="text-sm text-zinc-400">Codename</label>
        <input
          value={codename}
          onChange={(e) => setCodename(e.target.value)}
          className="w-full mb-3 rounded-md bg-black border border-zinc-700 px-3 py-2 text-sm"
        />

        <label className="text-sm text-zinc-400">Public Key (base64)</label>
        <textarea
          value={publicKey}
          onChange={(e) => setPublicKey(e.target.value)}
          className="w-full h-24 rounded-md bg-black border border-zinc-700 px-3 py-2 text-sm"
        />

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm text-zinc-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={loading || !codename.trim() || !publicKey.trim()}
            className="px-3 py-2 text-sm bg-cyan-500 rounded-md text-black hover:bg-cyan-400 disabled:opacity-50"
          >
            {loading ? "Adding…" : "Add Contact"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Encrypted Chat Shell (per unlocked identity) ----------

function ChatShell({
  identity,
  onBackToVault,
}: {
  identity: UnlockedIdentity;
  onBackToVault: () => void;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activeContactId, setActiveContactId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [input, setInput] = useState("");
  const [showAddContact, setShowAddContact] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [identityFp, setIdentityFp] = useState<string | null>(null);
  const [activeContactFp, setActiveContactFp] = useState<string | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);

  const activeContact =
    contacts.find((c) => c.id === activeContactId) ?? null;

  // Load contacts for this identity
  useEffect(() => {
    const loaded = loadContacts(identity.id);
    setContacts(loaded);
    if (loaded.length > 0 && !activeContactId) {
      setActiveContactId(loaded[0].id);
    }
  }, [identity.id]);

  // Load & decrypt messages for active contact
  useEffect(() => {
    async function loadAndDecrypt() {
      if (!activeContact || !activeContact.sharedKey) {
        setMessages([]);
        return;
      }
      setLoadingMessages(true);
      try {
        const stored = loadMessagesForContact(activeContact.id);
        const decrypted: DecryptedMessage[] = [];
        for (const m of stored as StoredMessage[]) {
          try {
            const plaintext = await decryptMessage(
              activeContact.sharedKey!,
              m.nonce,
              m.ciphertext
            );
            decrypted.push({
              id: m.id,
              direction: m.direction,
              plaintext,
              timestamp: m.timestamp,
            });
          } catch (err) {
            console.error("Failed to decrypt message", err);
          }
        }
        setMessages(decrypted);
      } finally {
        setLoadingMessages(false);
      }
    }
    loadAndDecrypt();
  }, [activeContactId, activeContact?.sharedKey]);

  // Poll relay for incoming messages
  // useEffect(() => {
  //   const interval = setInterval(async () => {
  //     try {
  //       const res = await fetch(`/api/messages?for=${identity.publicKey}`);
  //       if (!res.ok) return;
  //       const data = await res.json();
  //       if (!data.messages?.length) return;

  //       for (const m of data.messages as {
  //         from: string;
  //         to: string;
  //         ciphertext: string;
  //         nonce: string;
  //         timestamp: string;
  //       }[]) {
  //         const contact = contacts.find((c) => c.publicKey === m.from);
  //         if (!contact || !contact.sharedKey) continue;

  //         const plaintext = await decryptMessage(
  //           contact.sharedKey,
  //           m.nonce,
  //           m.ciphertext
  //         );

  //         addMessageForContact(
  //           contact.id,
  //           "in",
  //           m.ciphertext,
  //           m.nonce,
  //           m.timestamp
  //         );

  //         if (contact.id === activeContactId) {
  //           setMessages((prev) => [
  //             ...prev,
  //             {
  //               id: crypto.randomUUID(),
  //               direction: "in",
  //               plaintext,
  //               timestamp: m.timestamp,
  //             },
  //           ]);
  //         }
  //       }
  //     } catch (err) {
  //       console.error("Polling error:", err);
  //     }
  //   }, 2000);

  //   return () => clearInterval(interval);
  // }, [identity.publicKey, contacts, activeContactId]);

    // WebSocket connection to relay
    useEffect(() => {
      // Only run in browser
      if (typeof window === "undefined") return;

      let closed = false;
      const socket = new WebSocket("ws://localhost:4000");

      socket.onopen = () => {
        console.log("[client] ws connected, registering identity");

        socket.send(
          JSON.stringify({
            type: "register",
            publicKey: identity.publicKey,
          })
        );
      };

      socket.onclose = () => {
        console.log("[client] ws closed");
      };

      socket.onerror = (event) => {
        console.warn("[client] ws error", event.type);
      };


      // Handle incoming E2EE messages
      socket.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "message") {
            const { from, ciphertext, nonce, timestamp } = data;

            // find matching contact by sender's public key
            const contact = contacts.find((c) => c.publicKey === from);
            if (!contact || !contact.sharedKey) {
              console.warn("[client] incoming msg from unknown or unshared contact");
              return;
            }

            // decrypt
            const plaintext = await decryptMessage(
              contact.sharedKey,
              nonce,
              ciphertext
            );

            // store encrypted locally (for history)
            addMessageForContact(
              contact.id,
              "in",
              ciphertext,
              nonce,
              timestamp
            );

            // update UI if this contact is open
            if (contact.id === activeContactId) {
              setMessages((prev) => [
                ...prev,
                {
                  id: crypto.randomUUID(),
                  direction: "in",
                  plaintext,
                  timestamp,
                },
              ]);
            }
          }
        } catch (err) {
          console.error("[client] ws onmessage error", err);
        }
      };

      setWs(socket);

      return () => {
        closed = true;
        try {
          socket.close();
        } catch {}
        setWs(null);
      };
    }, [identity.publicKey, contacts, activeContactId]);


  // fingerprint for active identity
  useEffect(() => {
    let cancelled = false;

    getPublicKeyFingerprint(identity.publicKey)
      .then((fp) => {
        if (!cancelled) setIdentityFp(fp);
      })
      .catch((err) => {
        console.error("Failed to compute identity fingerprint", err);
        if (!cancelled) setIdentityFp(null);
      });

    return () => {
      cancelled = true;
    };
  }, [identity.publicKey]);

  // fingerprint for active contact
  useEffect(() => {
    let cancelled = false;

    if (!activeContact) {
      setActiveContactFp(null);
      return;
    }

    getPublicKeyFingerprint(activeContact.publicKey)
      .then((fp) => {
        if (!cancelled) setActiveContactFp(fp);
      })
      .catch((err) => {
        console.error("Failed to compute contact fingerprint", err);
        if (!cancelled) setActiveContactFp(null);
      });

    return () => {
      cancelled = true;
    };
  }, [activeContact?.publicKey]);


    const handleSend = async () => {
      if (!activeContact || !activeContact.sharedKey) return;
      const text = input.trim();
      if (!text) return;

      setInput("");

      const now = new Date().toISOString();
      const encrypted = await encryptMessage(activeContact.sharedKey, text);

      // store locally (encrypted)
      addMessageForContact(
        activeContact.id,
        "out",
        encrypted.ciphertext,
        encrypted.nonce,
        now
      );

      // optimistic UI
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          direction: "out",
          plaintext: text,
          timestamp: now,
        },
      ]);

      // 🔥 send to relay via WebSocket
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "message",
            from: identity.publicKey,
            to: activeContact.publicKey,
            ciphertext: encrypted.ciphertext,
            nonce: encrypted.nonce,
            timestamp: now,
          })
        );
      } else {
        console.warn("[client] ws not connected, message not relayed");
      }

      updateIdentityLastActive(identity.id);
    };


  return (
    <div className="flex h-screen bg-black text-white">
      {/* Sidebar */}
      <div
        className={`fixed md:relative z-50 md:z-auto transition-all duration-300 h-full ${
          sidebarOpen ? "w-80" : "w-0"
        } bg-zinc-950 border-r border-zinc-800 overflow-hidden`}
      >
        <div className="flex h-full flex-col">
          {/* Sidebar header */}
          <div className="border-b border-zinc-800 p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 animate-pulse rounded-full bg-cyan-500" />
                <h1 className="text-xs font-bold tracking-[0.2em] text-cyan-400">
                  ENCRYPTED CHAT
                </h1>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="text-zinc-400 hover:text-cyan-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-zinc-500">
              Active identity:{" "}
              <span className="font-mono text-cyan-400">
                {identity.codename}
              </span>
            </p>
            <p className="mt-1 text-[10px] text-zinc-500 break-all">
              Public key:{" "}
              <span className="font-mono text-[10px] text-zinc-400">
                {identity.publicKey}
              </span>
            </p>
            <p className="mt-1 text-[10px] text-zinc-500">
              Safety code:{" "}
              <span className="font-mono text-[10px] text-cyan-400">
                {identityFp ?? "…"}
              </span>
            </p>

            <p className="mt-1 text-[10px] text-zinc-500 break-all">
              Public key:{" "}
              <span className="font-mono text-[10px] text-zinc-400">
                {identity.publicKey}
              </span>
            </p>
            <button
              onClick={() => setShowAddContact(true)}
              className="mt-2 px-2 py-1 bg-zinc-800 text-xs rounded border border-zinc-700 hover:border-cyan-500"
            >
              + Add Contact
            </button>
          </div>

          {/* Contacts as conversations */}
          <div className="flex-1 overflow-y-auto divide-y divide-zinc-800">
            {contacts.length === 0 && (
              <div className="p-4 text-xs text-zinc-500">
                No contacts yet. Share your public key with someone and add
                them here.
              </div>
            )}
            {contacts.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setActiveContactId(c.id);
                  setSidebarOpen(false);
                }}
                className={`w-full border-l-2 p-4 text-left transition-colors ${
                  activeContactId === c.id
                    ? "border-cyan-500 bg-zinc-900"
                    : "border-transparent hover:bg-zinc-900/50"
                }`}
              >
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-sm font-bold uppercase">
                      {c.codename.slice(0, 2)}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-white">
                        {c.codename}
                      </span>
                      <span className="text-[10px] text-zinc-500 truncate max-w-[160px]">
                        {c.publicKey}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Lock className="h-3 w-3 text-cyan-400" />
                  <span className="text-[11px] text-zinc-500">
                    End-to-end encrypted
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Sidebar footer */}
          <div className="border-t border-zinc-800 p-4">
            <div className="rounded border border-zinc-800 bg-zinc-900 p-3 mb-2">
              <div className="mb-2 flex items-center gap-2">
                <Lock className="h-3 w-3 text-cyan-400" />
                <span className="text-xs font-semibold text-cyan-400">
                  SECURE CHANNEL
                </span>
              </div>
              <p className="text-xs text-zinc-500">
                Secret keys are encrypted with your passphrase. Messages are
                encrypted end-to-end with derived shared keys.
              </p>
            </div>
            <button
              onClick={onBackToVault}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-400 hover:border-cyan-500 hover:text-cyan-300"
            >
              Switch identity (back to vault)
            </button>
          </div>
        </div>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col bg-black">
        {/* Top bar */}
        <div className="flex h-16 items-center justify-between border-b border-zinc-800 bg-zinc-900 px-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-zinc-400 hover:text-cyan-400"
            >
              <Menu className="h-4 w-4" />
            </button>
            {activeContact ? (
              <div>
                <h2 className="text-sm font-semibold text-white">
                  {activeContact.codename}
                </h2>
                <p className="text-xs text-zinc-500">
                  End-to-end encrypted conversation
                </p>
                <p className="text-[10px] text-zinc-500">
                  Safety code:{" "}
                  <span className="font-mono text-[10px] text-cyan-400">
                    {activeContactFp ?? "…"}
                  </span>
                </p>
              </div>
            ) : (
              <div className="text-sm text-zinc-500">
                Select a contact to start chatting
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-cyan-400" />
            <span className="text-xs text-cyan-400">E2EE</span>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {!activeContact && (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900">
                    <Lock className="h-8 w-8 text-zinc-600" />
                  </div>
                  <p className="text-sm text-zinc-300">
                    Select a contact from the left.
                  </p>
                  <p className="mt-2 text-xs text-zinc-500">
                    Share your public key, exchange theirs, and add them to
                    start a secure chat.
                  </p>
                </div>
              </div>
            )}

            {activeContact && loadingMessages && (
              <p className="text-xs text-zinc-500">Decrypting messages…</p>
            )}

            {activeContact &&
              !loadingMessages &&
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${
                    m.direction === "out"
                      ? "justify-end"
                      : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-xs md:max-w-md px-3 py-2 rounded-lg text-sm ${
                      m.direction === "out"
                        ? "bg-cyan-600/20 border border-cyan-500/40 text-white"
                        : "bg-zinc-900 border border-zinc-800 text-zinc-100"
                    }`}
                  >
                    <p>{m.plaintext}</p>
                    <p className="mt-1 text-[10px] text-zinc-500">
                      {new Date(m.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}

            {activeContact && !loadingMessages && messages.length === 0 && (
              <p className="text-xs text-zinc-500">
                No messages yet. Your first message will be encrypted with
                the shared key.
              </p>
            )}
          </div>

          {/* Input */}
          {activeContact && (
            <div className="border-t border-zinc-800 bg-zinc-900 p-3">
              <div className="flex items-center gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Type a message (encrypted)…"
                  className="flex-1 rounded-md bg-black border border-zinc-700 px-3 py-2 text-sm outline-none focus:border-cyan-500"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || !activeContact.sharedKey}
                  className="flex items-center justify-center h-10 w-10 rounded-md bg-cyan-500 text-black hover:bg-cyan-400 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-1 flex items-center gap-1 text-[10px] text-zinc-500">
                <Lock className="h-3 w-3 text-cyan-400" />
                <span>
                  Messages are encrypted with a shared key derived from your
                  secret key and their public key.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {showAddContact && (
        <AddContactModal
          identity={identity}
          onClose={() => setShowAddContact(false)}
          onAdded={() => setContacts(loadContacts(identity.id))}
        />
      )}
    </div>
  );
}

// ---------- Root Page ----------

type Mode = "vault" | "create" | "chat" | "unlock";

export default function Page() {
  const [identities, setIdentities] = useState<StoredIdentity[]>([]);
  const [activeIdentity, setActiveIdentity] =
    useState<UnlockedIdentity | null>(null);
  const [pendingUnlock, setPendingUnlock] =
    useState<StoredIdentity | null>(null);
  const [mode, setMode] = useState<Mode>("vault");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const ids = loadIdentities();
    setIdentities(ids);

    if (ids.length === 0) {
      setMode("create");
    } else {
      setMode("vault");
    }

    setLoaded(true);
  }, []);

  const handleIdentityCreated = (id: UnlockedIdentity) => {
    const ids = loadIdentities();
    setIdentities(ids);
    setActiveIdentity(id);
    setActiveIdentityId(id.id);
    setMode("chat");
  };

  const handleActivateIdentity = (id: StoredIdentity) => {
    setPendingUnlock(id);
    setMode("unlock");
  };

  const handleUnlocked = (id: UnlockedIdentity) => {
    setPendingUnlock(null);
    setActiveIdentity(id);
    setActiveIdentityId(id.id);
    updateIdentityLastActive(id.id);
    setMode("chat");
  };

  const handleDeleteIdentity = (id: StoredIdentity) => {
    deleteIdentity(id.id);

    const removedContacts = deleteContactsForIdentity(id.id);
    const contactIds = removedContacts.map((c) => c.id);
    if (contactIds.length > 0) {
      deleteMessagesForContacts(contactIds);
    }

    const ids = loadIdentities();
    setIdentities(ids);

    if (activeIdentity && activeIdentity.id === id.id) {
      setActiveIdentity(null);
      setMode(ids.length === 0 ? "create" : "vault");
    }
  };

  if (!loaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-zinc-400">
        <span className="text-sm">Booting secure node…</span>
      </div>
    );
  }

  if (mode === "create") {
    return (
      <IdentityCreateScreen
        onCreated={handleIdentityCreated}
        hasExisting={identities.length > 0}
        onBackToVaultIfAny={() => setMode("vault")}
      />
    );
  }

  if (mode === "vault") {
    return (
      <IdentityVault
        identities={identities}
        onActivate={handleActivateIdentity}
        onCreateNew={() => setMode("create")}
        onDelete={handleDeleteIdentity}
      />
    );
  }

  if (mode === "unlock" && pendingUnlock) {
    return (
      <UnlockIdentityScreen
        identity={pendingUnlock}
        onUnlocked={handleUnlocked}
        onCancel={() => {
          setPendingUnlock(null);
          setMode("vault");
        }}
      />
    );
  }

  if (!activeIdentity) {
    return (
      <IdentityVault
        identities={identities}
        onActivate={handleActivateIdentity}
        onCreateNew={() => setMode("create")}
        onDelete={handleDeleteIdentity}
      />
    );
  }

  return (
    <ChatShell
      identity={activeIdentity}
      onBackToVault={() => {
        setActiveIdentity(null);
        setActiveIdentityId(null);
        const ids = loadIdentities();
        setIdentities(ids);
        setMode("vault");
      }}
    />
  );
}
