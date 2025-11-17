// components/chat/ChatShell.tsx
"use client";

import { useEffect, useState } from "react";
import {
  MessageSquare,
  Plus,
  Settings,
  Lock,
  Send,
  AlertCircle,
} from "lucide-react";

import {
  UnlockedIdentity,
  updateIdentityLastActive,
} from "@/lib/identities/store";

import {
  Contact,
  addContact,
  loadContacts,
} from "@/lib/contacts/store";

import {
  loadMessagesForContact,
  addMessageForContact,
  StoredMessage,
} from "@/lib/messages/store";

import {
  decryptMessage,
  encryptMessage,
} from "@/lib/crypto/session";

import { getPublicKeyFingerprint } from "@/lib/crypto/fingerprint";
import { safeRandomId } from "@/lib/utils/id";

// ---------- helpers ----------

function copyToClipboard(text: string, label?: string) {
  if (!text) return;
  try {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => {
          if (label) console.log(`Copied ${label} to clipboard`);
        },
        (err) => {
          console.warn("Clipboard write failed", err);
          alert("Failed to copy to clipboard");
        }
      );
      return;
    }
  } catch {
    // ignore
  }

  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand("copy");
    if (label) console.log(`Copied ${label} (fallback)`);
  } catch (err) {
    console.warn("execCommand copy failed", err);
    alert("Failed to copy to clipboard");
  } finally {
    document.body.removeChild(ta);
  }
}

function parseContactInput(
  codenameInput: string,
  publicKeyInput: string
): { codename: string; publicKey: string } | null {
  const c = codenameInput.trim();
  const pk = publicKeyInput.trim();

  // contact bundle format
  if (pk.startsWith("e2ee-contact:v1:")) {
    try {
      const jsonPart = pk.slice("e2ee-contact:v1:".length);
      const obj = JSON.parse(jsonPart);
      if (typeof obj.codename === "string" && typeof obj.publicKey === "string") {
        return { codename: obj.codename, publicKey: obj.publicKey };
      }
    } catch {
      // ignore, fall through
    }
  }

  if (!c || !pk) return null;
  return { codename: c, publicKey: pk };
}

// ---------- types ----------

interface DecryptedMessage {
  id: string;
  direction: "out" | "in";
  plaintext: string;
  timestamp: string;
}

// ---------- Add Contact Modal (same logic, styled a bit to match) ----------

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
      <div className="w-full max-w-sm rounded-lg border border-neutral-700 bg-neutral-950 p-6">
        <h2 className="mb-4 text-lg font-medium text-white">
          Add Contact
        </h2>

        <label className="text-sm text-neutral-400">Codename</label>
        <input
          value={codename}
          onChange={(e) => setCodename(e.target.value)}
          className="mb-3 w-full rounded-md border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-orange-500"
        />

        <label className="text-sm text-neutral-400">
          Public Key or Contact Bundle
        </label>
        <textarea
          value={publicKey}
          onChange={(e) => handlePublicKeyChange(e.target.value)}
          className="h-24 w-full rounded-md border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-orange-500"
        />

        <p className="mt-1 text-[10px] text-neutral-500">
          You can paste either a raw public key or a bundle starting with{" "}
          <span className="font-mono">e2ee-contact:v1:</span>.
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm text-neutral-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={loading}
            className="rounded-md bg-orange-500 px-3 py-2 text-sm text-black hover:bg-orange-600 disabled:opacity-50"
          >
            {loading ? "Adding…" : "Add Contact"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- ChatShell (logic unchanged, UI reskinned) ----------

export default function ChatShell({
  identity,
  onBackToVault,
}: {
  identity: UnlockedIdentity;
  onBackToVault: () => void;
}) {
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

  // load contacts on mount / identity change
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

  // WebSocket connection (same logic, onion-aware)
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

  // ---------- UI (tactical style) ----------

  return (
    <div className="flex h-screen bg-black text-white font-mono">
      {/* Sidebar */}
      <aside className="w-80 border-r border-neutral-800 bg-neutral-950 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-neutral-900 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-orange-400" />
            </div>
            <div>
              <div className="text-xs text-neutral-400 uppercase tracking-[0.2em]">
                SECURE NODE
              </div>
              <div className="text-sm text-neutral-300">
                {identity.codename}
              </div>
            </div>
          </div>
          <button
            className="p-2 rounded hover:bg-neutral-800"
            onClick={() => setShowAddContact(true)}
          >
            <Plus className="w-4 h-4 text-neutral-400" />
          </button>
        </div>

        {/* Identity details / bundle */}
        <div className="p-4 border-b border-neutral-800 space-y-2">
          <div className="text-[10px] text-neutral-500">
            Public key:
            <span className="block break-all font-mono text-[10px] text-neutral-300 mt-1">
              {identity.publicKey}
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              copyToClipboard(identity.publicKey, "public key")
            }
            className="text-[10px] px-2 py-1 rounded border border-neutral-700 text-neutral-400 hover:border-orange-500 hover:text-orange-400"
          >
            Copy public key
          </button>
          <div className="text-[10px] text-neutral-500">
            Safety code:{" "}
            <span className="font-mono text-orange-400">
              {identityFp ?? "…"}
            </span>
          </div>
          <div className="mt-2 rounded border border-neutral-800 bg-neutral-900 p-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-neutral-400">
                Contact bundle
              </span>
              <button
                type="button"
                onClick={() =>
                  copyToClipboard(contactBundle, "contact bundle")
                }
                className="text-[10px] px-1.5 py-0.5 rounded border border-neutral-700 text-neutral-400 hover:border-orange-500 hover:text-orange-400"
              >
                Copy
              </button>
            </div>
            <p className="text-[10px] text-neutral-500 break-all line-clamp-3">
              {contactBundle}
            </p>
          </div>
        </div>

        {/* Conversations (contacts) */}
        <div className="flex-1 overflow-y-auto">
          {contacts.length === 0 && (
            <div className="p-4 text-xs text-neutral-500">
              No contacts yet. Share your bundle or public key and add them
              here.
            </div>
          )}
          {contacts.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveContactId(c.id)}
              className={`w-full text-left px-4 py-3 border-l-2 transition-colors flex flex-col gap-1 ${
                activeContactId === c.id
                  ? "bg-neutral-900 border-orange-500"
                  : "border-transparent hover:bg-neutral-900/60"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-100">
                  {c.codename}
                </span>
                <span className="text-[10px] text-neutral-500">
                  E2EE
                </span>
              </div>
              <span className="text-[10px] text-neutral-500 truncate max-w-[220px]">
                {c.publicKey}
              </span>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-neutral-400">ONLINE</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onBackToVault}
              className="text-[10px] px-2 py-1 rounded border border-neutral-700 text-neutral-400 hover:border-orange-500 hover:text-orange-400"
            >
              Switch ID
            </button>
            <button className="p-2 rounded hover:bg-neutral-800">
              <Settings className="w-4 h-4 text-neutral-400" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main chat window */}
      <main className="flex-1 flex flex-col bg-neutral-950">
        {/* Header */}
        <div className="h-16 border-b border-neutral-800 px-6 flex items-center justify-between bg-neutral-950">
          <div className="flex flex-col">
            {activeContact ? (
              <>
                <span className="text-xs text-neutral-500">
                  SECURE CHANNEL
                </span>
                <span className="text-sm text-neutral-100">
                  {activeContact.codename}
                </span>
                <span className="text-[10px] text-neutral-500">
                  Safety code:{" "}
                  <span className="font-mono text-orange-400">
                    {activeContactFp ?? "…"}
                  </span>
                </span>
              </>
            ) : (
              <>
                <span className="text-xs text-neutral-500">
                  NO CHANNEL SELECTED
                </span>
                <span className="text-sm text-neutral-400">
                  Choose or add a contact on the left
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-orange-400" />
            <span className="text-xs text-orange-400">E2EE ACTIVE</span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-neutral-950">
          {!activeContact && (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-lg border border-neutral-800 bg-neutral-900 flex items-center justify-center">
                  <Lock className="w-8 h-8 text-neutral-600" />
                </div>
                <p className="text-sm text-neutral-300">
                  Select a contact to begin a secure conversation.
                </p>
                <p className="text-xs text-neutral-500 mt-2">
                  Exchange contact bundles over another channel, then add
                  them in the sidebar.
                </p>
              </div>
            </div>
          )}

          {activeContact && loadingMessages && (
            <p className="text-xs text-neutral-500">
              Decrypting messages…
            </p>
          )}

          {activeContact &&
            !loadingMessages &&
            messages.map((m) => {
              const isUser = m.direction === "out";
              return (
                <div
                  key={m.id}
                  className={`flex ${
                    isUser ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-md rounded-lg px-4 py-3 text-sm shadow-sm ${
                      isUser
                        ? "bg-orange-500 text-black"
                        : "bg-neutral-900 text-neutral-100 border border-neutral-800"
                    }`}
                  >
                    <p>{m.plaintext}</p>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-[10px] text-neutral-800/70">
                        {new Date(m.timestamp).toLocaleTimeString()}
                      </span>
                      {isUser && (
                        <span className="text-[10px] text-neutral-900/80">
                          encrypted
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

          {activeContact &&
            !loadingMessages &&
            messages.length === 0 && (
              <p className="text-xs text-neutral-500">
                No messages yet. Your first message will be encrypted with
                the derived shared key.
              </p>
            )}
        </div>

        {/* Input */}
        {activeContact && (
          <div className="border-t border-neutral-800 bg-neutral-950 p-4">
            <div className="flex items-end gap-3">
              <button className="p-3 rounded hover:bg-neutral-900">
                {/* just visual, no attachment logic yet */}
                <span className="sr-only">Attachment</span>
                <svg
                  className="w-5 h-5 text-neutral-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.49-8.48" />
                </svg>
              </button>
              <div className="flex-1">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Enter tactical message..."
                  className="w-full px-4 py-3 bg-neutral-900 border border-neutral-700 rounded outline-none focus:border-orange-500 text-sm text-neutral-100 placeholder:text-neutral-500"
                />
              </div>
              <button
                onClick={handleSend}
                disabled={!input.trim() || !activeContact.sharedKey}
                className="p-3 rounded bg-orange-500 hover:bg-orange-600 disabled:opacity-50"
              >
                <Send className="w-5 h-5 text-black" />
              </button>
            </div>
            <div className="flex items-center gap-2 mt-3 text-xs text-neutral-500">
              <AlertCircle className="w-3 h-3" />
              <span>
                Messages are encrypted end-to-end. The relay only sees
                ciphertext.
              </span>
            </div>
          </div>
        )}
      </main>

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
