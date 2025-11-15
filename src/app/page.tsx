// src/app/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Menu, X, Lock, Send } from "lucide-react";

import {
  StoredIdentity,
  UnlockedIdentity,
  loadIdentities,
  createIdentity,
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

import { getPublicKeyFingerprint } from "@/lib/crypto/fingerprint";
import { safeRandomId } from "@/lib/utils/id";

// helper to copy text
function copyToClipboard(text: string, label?: string) {
  if (!text) return;
  try {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => {
          if (label) {
            console.log(`Copied ${label} to clipboard`);
          }
        },
        (err) => {
          console.warn("Clipboard write failed", err);
          alert("Failed to copy to clipboard");
        }
      );
      return;
    }
  } catch {
    // fall through
  }

  // fallback
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand("copy");
    if (label) console.log(`Copied ${label} to clipboard (fallback)`);
  } catch (err) {
    console.warn("execCommand copy failed", err);
    alert("Failed to copy to clipboard");
  } finally {
    document.body.removeChild(ta);
  }
}

// ---------- types ----------

interface DecryptedMessage {
  id: string;
  direction: "out" | "in";
  plaintext: string;
  timestamp: string;
}

// ---------- Identity Create Screen ----------

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
          <p className="mb-4 text-sm text-zinc-500">
            No identities yet. Create your first identity to start.
          </p>
        )}

        <div className="mb-4 max-h-72 space-y-2 overflow-y-auto">
          {identities.map((id) => (
            <div
              key={id.id}
              className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2"
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {id.codename}
                </span>
                <span className="break-all text-[10px] text-zinc-500">
                  {id.publicKey}
                </span>
                <span className="mt-1 text-[10px] text-zinc-600">
                  Last active:{" "}
                  {id.lastActiveAt
                    ? new Date(id.lastActiveAt).toLocaleString()
                    : "never"}
                </span>
              </div>
              <div className="ml-2 flex flex-col gap-1">
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

// ---------- Contact bundle parser ----------

function parseContactInput(
  codenameInput: string,
  publicKeyInput: string
): { codename: string; publicKey: string } | null {
  const c = codenameInput.trim();
  const pk = publicKeyInput.trim();

  // try bundle format first
  if (pk.startsWith("e2ee-contact:v1:")) {
    try {
      const jsonPart = pk.slice("e2ee-contact:v1:".length);
      const obj = JSON.parse(jsonPart);
      if (typeof obj.codename === "string" && typeof obj.publicKey === "string") {
        return {
          codename: obj.codename,
          publicKey: obj.publicKey,
        };
      }
    } catch {
      // fall through
    }
  }

  // fallback: treat as separate codename + public key
  if (!c || !pk) return null;
  return { codename: c, publicKey: pk };
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
    const parsed = parseContactInput(codename, publicKey);
    if (!parsed) return;

    setLoading(true);
    try {
      await addContact(
        identity.id,
        identity.secretKey,
        parsed.codename,
        parsed.publicKey
      );
      onAdded();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  // optional: auto-fill codename if bundle pasted
  const handlePublicKeyChange = (value: string) => {
    setPublicKey(value);
    if (value.startsWith("e2ee-contact:v1:")) {
      try {
        const jsonPart = value.slice("e2ee-contact:v1:".length);
        const obj = JSON.parse(jsonPart);
        if (typeof obj.codename === "string") {
          setCodename(obj.codename);
        }
      } catch {
        // ignore
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-sm rounded-lg border border-zinc-700 bg-zinc-900 p-6">
        <h2 className="mb-4 text-lg font-medium text-white">
          Add Contact
        </h2>

        <label className="text-sm text-zinc-400">Codename</label>
        <input
          value={codename}
          onChange={(e) => setCodename(e.target.value)}
          className="mb-3 w-full rounded-md border border-zinc-700 bg-black px-3 py-2 text-sm"
        />

        <label className="text-sm text-zinc-400">
          Public Key or Contact Bundle
        </label>
        <textarea
          value={publicKey}
          onChange={(e) => handlePublicKeyChange(e.target.value)}
          className="h-24 w-full rounded-md border border-zinc-700 bg-black px-3 py-2 text-sm"
        />

        <p className="mt-1 text-[10px] text-zinc-500">
          You can paste either a raw public key or a contact bundle starting
          with <span className="font-mono">e2ee-contact:v1:</span>.
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm text-zinc-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={loading}
            className="rounded-md bg-cyan-500 px-3 py-2 text-sm text-black hover:bg-cyan-400 disabled:opacity-50"
          >
            {loading ? "Adding…" : "Add Contact"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Chat Shell ----------

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

  const contactBundle = `e2ee-contact:v1:${JSON.stringify({
    codename: identity.codename,
    publicKey: identity.publicKey,
  })}`;

  // load contacts
  useEffect(() => {
    const loaded = loadContacts(identity.id);
    setContacts(loaded);
    if (loaded.length > 0 && !activeContactId) {
      setActiveContactId(loaded[0].id);
    }
  }, [identity.id]);

  // load & decrypt messages for active contact
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

  // identity fingerprint
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

  // active contact fingerprint
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

  // WebSocket connection
  useEffect(() => {
    if (typeof window === "undefined") return;

    const host = window.location.hostname;
    const isOnion = host.endsWith(".onion");

    const url =
      (process.env.NEXT_PUBLIC_RELAY_WS_URL as string | undefined) ||
      (isOnion ? `ws://${host}:4000` : "ws://localhost:4000");

    let socket: WebSocket | null = null;

    try {
      socket = new WebSocket(url);
    } catch (err) {
      console.warn("[client] failed to open WebSocket", err);
      return;
    }

    socket.onopen = () => {
      console.log("[client] ws connected to", url);
      socket!.send(
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
      console.warn("[client] ws error", (event as any).type);
    };

    socket.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "message") {
          const { from, ciphertext, nonce, timestamp } = data;

          const contact = contacts.find((c) => c.publicKey === from);
          if (!contact || !contact.sharedKey) {
            console.warn(
              "[client] incoming msg from unknown/unshared contact"
            );
            return;
          }

          const plaintext = await decryptMessage(
            contact.sharedKey,
            nonce,
            ciphertext
          );

          addMessageForContact(
            contact.id,
            "in",
            ciphertext,
            nonce,
            timestamp
          );

          if (contact.id === activeContactId) {
            setMessages((prev) => [
              ...prev,
              {
                id: safeRandomId(),
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
      try {
        socket?.close();
      } catch {}
      setWs(null);
    };
  }, [identity.publicKey, contacts, activeContactId]);

  const handleSend = async () => {
    if (!activeContact || !activeContact.sharedKey) return;
    const text = input.trim();
    if (!text) return;

    setInput("");

    const now = new Date().toISOString();
    const encrypted = await encryptMessage(activeContact.sharedKey, text);

    addMessageForContact(
      activeContact.id,
      "out",
      encrypted.ciphertext,
      encrypted.nonce,
      now
    );

    setMessages((prev) => [
      ...prev,
      {
        id: safeRandomId(),
        direction: "out",
        plaintext: text,
        timestamp: now,
      },
    ]);

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
        className={`fixed h-full overflow-hidden border-r border-zinc-800 bg-zinc-950 transition-all duration-300 md:relative md:z-auto ${
          sidebarOpen ? "w-80" : "w-0"
        }`}
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

            <p className="flex items-center gap-2 text-xs text-zinc-500">
              <span>
                Active identity:{" "}
                <span className="font-mono text-cyan-400">
                  {identity.codename}
                </span>
              </span>
              <button
                type="button"
                onClick={() =>
                  copyToClipboard(identity.codename, "codename")
                }
                className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400 hover:border-cyan-500 hover:text-cyan-300"
              >
                Copy
              </button>
            </p>

            <p className="mt-1 break-all text-[10px] text-zinc-500">
              Public key:{" "}
              <span className="font-mono text-[10px] text-zinc-400">
                {identity.publicKey}
              </span>
            </p>
            <button
              type="button"
              onClick={() =>
                copyToClipboard(identity.publicKey, "public key")
              }
              className="mt-1 rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400 hover:border-cyan-500 hover:text-cyan-300 text-[10px]"
            >
              Copy public key
            </button>

            <p className="mt-1 text-[10px] text-zinc-500">
              Safety code:{" "}
              <span className="font-mono text-[10px] text-cyan-400">
                {identityFp ?? "…"}
              </span>
            </p>

            <div className="mt-3 rounded border border-zinc-800 bg-zinc-900 p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-zinc-400">
                  SHARE CONTACT BUNDLE
                </span>
                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(contactBundle, "contact bundle")
                  }
                  className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400 hover:border-cyan-500 hover:text-cyan-300"
                >
                  Copy
                </button>
              </div>
              <p className="line-clamp-3 break-all text-[10px] text-zinc-500">
                {contactBundle}
              </p>
            </div>

            <button
              onClick={() => setShowAddContact(true)}
              className="mt-3 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 hover:border-cyan-500"
            >
              + Add Contact
            </button>
          </div>

          {/* Contacts */}
          <div className="flex-1 divide-y divide-zinc-800 overflow-y-auto">
            {contacts.length === 0 && (
              <div className="p-4 text-xs text-zinc-500">
                No contacts yet. Share your bundle or public key and add
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
                <div className="mb-1 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-sm font-bold uppercase">
                      {c.codename.slice(0, 2)}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-white">
                        {c.codename}
                      </span>
                      <span className="max-w-[160px] truncate text-[10px] text-zinc-500">
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
            <div className="mb-2 rounded border border-zinc-800 bg-zinc-900 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Lock className="h-3 w-3 text-cyan-400" />
                <span className="text-xs font-semibold text-cyan-400">
                  SECURE CHANNEL
                </span>
              </div>
              <p className="text-xs text-zinc-500">
                Secret keys are encrypted with your passphrase. Messages
                are encrypted end-to-end with derived shared keys.
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

        {/* Messages + input */}
        <div className="flex flex-1 flex-col">
          <div className="flex-1 space-y-2 overflow-y-auto p-4">
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
                    Share your contact bundle, exchange theirs, and add
                    them to start a secure chat.
                  </p>
                </div>
              </div>
            )}

            {activeContact && loadingMessages && (
              <p className="text-xs text-zinc-500">
                Decrypting messages…
              </p>
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
                    className={`max-w-xs rounded-lg px-3 py-2 text-sm md:max-w-md ${
                      m.direction === "out"
                        ? "border border-cyan-500/40 bg-cyan-600/20 text-white"
                        : "border border-zinc-800 bg-zinc-900 text-zinc-100"
                    }`}
                  >
                    <p>{m.plaintext}</p>
                    <p className="mt-1 text-[10px] text-zinc-500">
                      {new Date(m.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}

            {activeContact &&
              !loadingMessages &&
              messages.length === 0 && (
                <p className="text-xs text-zinc-500">
                  No messages yet. Your first message will be encrypted
                  with the shared key.
                </p>
              )}
          </div>

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
                  className="flex-1 rounded-md border border-zinc-700 bg-black px-3 py-2 text-sm outline-none focus:border-cyan-500"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || !activeContact.sharedKey}
                  className="flex h-10 w-10 items-center justify-center rounded-md bg-cyan-500 text-black hover:bg-cyan-400 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-1 flex items-center gap-1 text-[10px] text-zinc-500">
                <Lock className="h-3 w-3 text-cyan-400" />
                <span>
                  Messages are encrypted with a shared key derived from
                  your secret key and their public key.
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
