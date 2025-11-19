"use client";

import { useEffect, useState, useRef } from "react";
import { Menu, X, Lock, Send, ChevronDown, Copy, Check } from "lucide-react";
import { toast, Toaster } from "sonner";
import QRCode from "react-qr-code";

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
  dedupeAllContacts,
} from "@/lib/contacts/store";

import {
  loadMessagesForContact,
  addMessageForContact,
  deleteMessagesForContacts,
  StoredMessage,
} from "@/lib/messages/store";

import { decryptMessage, encryptMessage, deriveSessionKey } from "@/lib/crypto/session";

import {
  GroupChat,
  loadGroups,
  createGroup,
  applyGroupEvent,
  GroupEvent,
} from "@/lib/groups/store";

import {
  ensureSelfSenderKeyState,
  applySenderKeyBundle,
  encryptGroupMessageAsSender,
  decryptGroupMessageAsReceiver,
  SenderKeyBundle,
} from "@/lib/groups/senderKeys";


import { getPublicKeyFingerprint } from "@/lib/crypto/fingerprint";
import { safeRandomId } from "@/lib/utils/id";

// ───────────────────────────────────────────────
// Utility: copy to clipboard
// ───────────────────────────────────────────────

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

interface DecryptedMessage {
  id: string;
  direction: "out" | "in";
  plaintext: string;
  timestamp: string;
  sender?: string; // publicKey
  senderCodename?: string;
}

function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}

// ───────────────────────────────────────────────
// UI components
// ───────────────────────────────────────────────

function MessageGroup({
  messages,
  direction,
  senderCodename,
}: {
  messages: DecryptedMessage[];
  direction: "in" | "out";
  senderCodename?: string;
}) {
  const firstTime = new Date(messages[0].timestamp);
  const timeStr = firstTime.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className={`flex ${direction === "out" ? "justify-end" : "justify-start"
        } group mb-3`}
    >
      <div
        className={`rounded px-5 py-3 space-y-2 max-w-2xl border transition-all hover:shadow-lg ${direction === "out"
          ? "border-orange-400/50 bg-orange-950/40 text-orange-50 hover:border-orange-400 hover:bg-orange-950/60"
          : "border-neutral-600 bg-neutral-800 text-neutral-50 hover:border-neutral-500 hover:bg-neutral-700"
          }`}
      >
        {direction === "in" && senderCodename && (
          <p className="text-xs font-bold text-orange-400 mb-1 uppercase tracking-wider">
            {senderCodename}
          </p>
        )}
        {messages.map((m) => (
          <p
            key={m.id}
            className="whitespace-pre-wrap text-sm break-words leading-relaxed font-mono"
          >
            {m.plaintext}
          </p>
        ))}
        <p
          className={`text-xs mt-3 transition-opacity opacity-70 group-hover:opacity-100 font-mono ${direction === "out" ? "text-orange-400/60" : "text-neutral-500"
            }`}
        >
          {timeStr}
        </p>
      </div>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    copyToClipboard(text, label);
    setCopied(true);
    toast.success(`Copied ${label || "text"} to clipboard`);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded border border-neutral-600 px-3 py-2 text-xs text-neutral-300 hover:border-orange-500 hover:text-orange-400 transition-all hover:bg-orange-500/10 font-semibold uppercase tracking-wide"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 inline mr-1" />
          COPIED
        </>
      ) : (
        <>
          <Copy className="h-3 w-3 inline mr-1" />
          COPY
        </>
      )}
    </button>
  );
}

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-neutral-700">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-sm font-bold text-orange-400 uppercase tracking-widest hover:bg-neutral-800/70 transition-colors"
      >
        {title}
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""
            }`}
        />
      </button>
      {open && (
        <div className="px-4 py-3 space-y-3 bg-neutral-900/50 border-t border-neutral-700">
          {children}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────
// Identity screens
// ───────────────────────────────────────────────

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
      <div className="w-full max-w-sm rounded border border-neutral-700 bg-neutral-900 p-8 font-mono shadow-xl">
        <div className="mb-6 flex items-center gap-3 pb-4 border-b border-neutral-700">
          <Lock className="h-5 w-5 text-orange-500" />
          <h1 className="text-sm font-bold tracking-widest text-orange-500 uppercase">
            CREATE SECURE IDENTITY
          </h1>
        </div>
        <h2 className="mb-2 text-lg font-bold text-white">Initialize New Agent</h2>
        <p className="mb-6 text-sm text-neutral-400 leading-relaxed">
          Secret keys are encrypted with your passphrase and stored locally in
          this browser.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              Agent Codename
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={codename}
                onChange={(e) => setCodename(e.target.value)}
                placeholder="e.g. neon-fox-314"
                className="flex-1 rounded border border-neutral-700 bg-black px-3 py-2 text-sm font-mono text-white placeholder-neutral-600 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30"
              />
              <button
                type="button"
                onClick={generateCodename}
                className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-medium text-neutral-300 hover:border-orange-500 hover:text-orange-400 transition-colors"
              >
                Random
              </button>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              Access Passphrase
            </label>
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              className="w-full rounded border border-neutral-700 bg-black px-3 py-2 text-sm font-mono text-white outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              Confirm Passphrase
            </label>
            <input
              type="password"
              value={pass2}
              onChange={(e) => setPass2(e.target.value)}
              className="w-full rounded border border-neutral-700 bg-black px-3 py-2 text-sm font-mono text-white outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 border-l-2 border-red-500 pl-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded bg-orange-500 px-4 py-3 text-sm font-bold text-black hover:bg-orange-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span>INITIALIZING…</span>
            ) : (
              <>
                <Lock className="h-4 w-4" />
                <span>CREATE IDENTITY</span>
              </>
            )}
          </button>
        </form>
        {hasExisting && (
          <button
            onClick={onBackToVaultIfAny}
            className="mt-4 w-full text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            ← RETURN TO VAULT
          </button>
        )}
      </div>
    </div>
  );
}

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
      <div className="w-full max-w-sm rounded border border-neutral-700 bg-neutral-900 p-8 font-mono shadow-xl">
        <div className="mb-6 flex items-center gap-3 pb-4 border-b border-neutral-700">
          <Lock className="h-5 w-5 text-orange-500" />
          <h1 className="text-sm font-bold tracking-widest text-orange-500 uppercase">
            UNLOCK IDENTITY
          </h1>
        </div>
        <h2 className="mb-2 text-lg font-bold text-white">{identity.codename}</h2>
        <p className="mb-6 text-sm text-neutral-400 leading-relaxed">
          Enter your passphrase to unlock this secure identity. Secret keys never
          leave this browser.
        </p>

        <form onSubmit={handleUnlock} className="space-y-4">
          <div>
            <label className="mb-2 block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              Access Passphrase
            </label>
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              className="w-full rounded border border-neutral-700 bg-black px-3 py-2 text-sm font-mono text-white outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 border-l-2 border-red-500 pl-2">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="w-1/3 rounded border border-neutral-600 bg-neutral-800 px-3 py-2 text-xs font-medium text-neutral-300 hover:border-neutral-500 transition-colors"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={loading}
              className="w-2/3 rounded bg-orange-500 px-3 py-2 text-sm font-bold text-black hover:bg-orange-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "UNLOCKING…" : "UNLOCK"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

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
      <div className="w-full max-w-2xl rounded border border-neutral-700 bg-neutral-900 p-8 font-mono shadow-xl">
        <div className="mb-6 flex items-center gap-3 pb-4 border-b border-neutral-700">
          <Lock className="h-5 w-5 text-orange-500" />
          <h1 className="text-sm font-bold tracking-widest text-orange-500 uppercase">
            IDENTITY VAULT
          </h1>
        </div>
        <h2 className="mb-2 text-lg font-bold text-white">Select Active Identity</h2>
        <p className="mb-6 text-sm text-neutral-400 leading-relaxed">
          Each identity maintains separate keys, contacts, and encrypted message
          history.
        </p>

        {identities.length === 0 && (
          <p className="mb-4 text-sm text-neutral-500">
            No identities found. Create your first secure identity to begin.
          </p>
        )}

        <div className="mb-6 max-h-96 space-y-3 overflow-y-auto">
          {identities.map((id) => (
            <div
              key={id.id}
              className="flex items-center justify-between rounded border border-neutral-700 bg-neutral-800 p-4 hover:border-orange-500/50 hover:bg-neutral-700/50 transition-all"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-bold text-white">
                    {id.codename}
                  </span>
                  <div className="h-2 w-2 bg-orange-500 rounded-full" />
                </div>
                <span className="block truncate text-xs text-neutral-500 font-mono">
                  {id.publicKey}
                </span>
                <span className="block text-xs text-neutral-600 mt-1">
                  Last active:{" "}
                  {id.lastActiveAt
                    ? new Date(id.lastActiveAt).toLocaleString()
                    : "never"}
                </span>
              </div>
              <div className="ml-4 flex flex-col gap-2">
                <button
                  onClick={() => onActivate(id)}
                  className="rounded border border-orange-500 px-3 py-1 text-xs font-bold text-orange-400 hover:bg-orange-500/20 transition-colors"
                >
                  ACTIVATE
                </button>
                <button
                  onClick={() => onDelete(id)}
                  className="rounded border border-red-600 px-3 py-1 text-xs font-bold text-red-400 hover:bg-red-600/20 transition-colors"
                >
                  DELETE
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={onCreateNew}
          className="w-full rounded bg-orange-500 px-4 py-3 text-sm font-bold text-black hover:bg-orange-400 transition-colors"
        >
          + CREATE NEW IDENTITY
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────
// Contacts / Groups modals
// ───────────────────────────────────────────────

function parseContactInput(
  codenameInput: string,
  publicKeyInput: string
): { codename: string; publicKey: string } | null {
  const c = codenameInput.trim();
  const pk = publicKeyInput.trim();

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

  if (!c || !pk) return null;
  return { codename: c, publicKey: pk };
}

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
      <div className="w-full max-w-sm rounded border border-neutral-700 bg-neutral-900 p-6 font-mono shadow-xl">
        <h2 className="mb-4 text-sm font-bold text-orange-400 uppercase tracking-widest">
          ADD CONTACT
        </h2>

        <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2 block">
          Contact Codename
        </label>
        <input
          value={codename}
          onChange={(e) => setCodename(e.target.value)}
          className="mb-4 w-full rounded border border-neutral-700 bg-black px-3 py-2 text-sm font-mono text-white outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30"
        />

        <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2 block">
          Public Key or Bundle
        </label>
        <textarea
          value={publicKey}
          onChange={(e) => handlePublicKeyChange(e.target.value)}
          className="h-24 w-full rounded border border-neutral-700 bg-black px-3 py-2 text-sm font-mono text-white outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30 resize-none"
        />

        <p className="mt-2 text-xs text-neutral-500">
          Paste a raw public key or contact bundle starting with{" "}
          <span className="font-bold text-orange-500">e2ee-contact:v1:</span>
        </p>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-2 text-xs font-medium text-neutral-400 hover:text-white transition-colors"
          >
            CANCEL
          </button>
          <button
            onClick={handleAdd}
            disabled={loading}
            className="rounded bg-orange-500 px-4 py-2 text-xs font-bold text-black hover:bg-orange-400 transition-colors disabled:opacity-50"
          >
            {loading ? "ADDING…" : "ADD CONTACT"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Group creation modal – only creates locally, broadcasting is done in ChatShell
function CreateGroupModal({
  identity,
  contacts,
  onClose,
  onCreated,
}: {
  identity: UnlockedIdentity;
  contacts: Contact[];
  onClose: () => void;
  onCreated: (group: GroupChat) => void;
}) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleContact = (publicKey: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(publicKey)) next.delete(publicKey);
      else next.add(publicKey);
      return next;
    });
  };

  const handleCreate = () => {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Group name is required");
      return;
    }
    if (selected.size === 0) {
      setError("Select at least one contact");
      return;
    }

    setLoading(true);
    try {
      const memberPublicKeys = [identity.publicKey, ...Array.from(selected)];
      const group = createGroup(identity.id, trimmed, memberPublicKeys);

      onCreated(group);
      onClose();
    } catch (err) {
      console.error(err);
      setError("Failed to create group");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-sm rounded border border-neutral-700 bg-neutral-900 p-6 font-mono shadow-xl max-h-[80vh] overflow-y-auto">
        <h2 className="mb-4 text-sm font-bold text-orange-400 uppercase tracking-widest">
          CREATE GROUP
        </h2>

        <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2 block">
          Group Name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mb-4 w-full rounded border border-neutral-700 bg-black px-3 py-2 text-sm font-mono text-white outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30"
          placeholder="e.g. security-team"
        />

        <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2 block">
          Members (contacts)
        </label>
        <div className="max-h-40 overflow-y-auto mb-3 space-y-1">
          {contacts.length === 0 && (
            <p className="text-xs text-neutral-500">
              You have no contacts yet. Add contacts first.
            </p>
          )}
          {contacts.map((c) => {
            const checked = selected.has(c.publicKey);
            return (
              <label
                key={c.id}
                className="flex items-center gap-2 text-xs text-neutral-200 cursor-pointer hover:bg-neutral-800/60 px-2 py-1 rounded"
              >
                <input
                  type="checkbox"
                  className="h-3 w-3"
                  checked={checked}
                  onChange={() => toggleContact(c.publicKey)}
                />
                <span className="font-bold truncate">{c.codename}</span>
                <span className="text-[9px] text-neutral-500 truncate">
                  {c.publicKey.slice(0, 12)}…
                </span>
              </label>
            );
          })}
        </div>

        <p className="text-[10px] text-neutral-500 mb-2">
          Your own identity is always included as a member.
        </p>

        {error && (
          <p className="text-xs text-red-400 border-l-2 border-red-500 pl-2 mb-2">
            {error}
          </p>
        )}

        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-2 text-xs font-medium text-neutral-400 hover:text-white transition-colors"
          >
            CANCEL
          </button>
          <button
            onClick={handleCreate}
            disabled={loading || contacts.length === 0}
            className="rounded bg-orange-500 px-4 py-2 text-xs font-bold text-black hover:bg-orange-400 transition-colors disabled:opacity-50"
          >
            {loading ? "CREATING…" : "CREATE GROUP"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────
// Main chat shell
// ───────────────────────────────────────────────

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
  const [groupChats, setGroupChats] = useState<GroupChat[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"contacts" | "groups">("contacts");

  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [input, setInput] = useState("");
  const [showAddContact, setShowAddContact] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [identityFp, setIdentityFp] = useState<string | null>(null);
  const [activeContactFp, setActiveContactFp] = useState<string | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [showIdentityDetails, setShowIdentityDetails] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeContact =
    contacts.find((c) => c.id === activeContactId) || undefined;

  const activeGroup =
    groupChats.find((g) => g.id === activeGroupId) || undefined;

  const contactBundle = `e2ee-contact:v1:${JSON.stringify({
    codename: identity.codename,
    publicKey: identity.publicKey,
  })}`;

  const groupedMessages = messages.reduce((acc, msg) => {
    const lastGroup = acc[acc.length - 1];
    if (
      lastGroup &&
      lastGroup.direction === msg.direction &&
      lastGroup.sender === msg.sender && // Check sender match
      new Date(msg.timestamp).getTime() -
      new Date(
        lastGroup.messages[lastGroup.messages.length - 1].timestamp
      ).getTime() <
      60_000
    ) {
      lastGroup.messages.push(msg);
    } else {
      acc.push({
        direction: msg.direction,
        sender: msg.sender,
        senderCodename: msg.senderCodename,
        messages: [msg],
      });
    }
    return acc;
  }, [] as Array<{ direction: "in" | "out"; messages: DecryptedMessage[]; sender?: string; senderCodename?: string }>);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const loaded = loadContacts(identity.id);
    setContacts(loaded);
    if (loaded.length > 0 && !activeContactId) {
      setActiveContactId(loaded[0].id);
    }
  }, [identity.id, activeContactId]);

  useEffect(() => {
    async function loadAndDecrypt() {
      // GROUP CHAT MODE: currently we don't have local history for groups,
      // just ensure sender key exists, then clear messages.
      if (activeGroup) {
        setMessages([]);

        try {
          await ensureSelfSenderKeyState(
            identity.id,
            activeGroup.id,
            identity.publicKey
          );
        } catch (err) {
          console.error("Failed to initialize sender key for group", err);
        }

        return;
      }

      // DIRECT MESSAGE MODE
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
              activeContact.sharedKey,
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
  }, [
    activeContact?.sharedKey,
    activeContactId,
    activeGroup?.id,
    identity.id,
    identity.publicKey,
  ]);

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

  useEffect(() => {
    const loadedGroups = loadGroups(identity.id);
    setGroupChats(loadedGroups);
  }, [identity.id]);

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

        // 0) New: Sender key bundle for groups
        // 0) New: Sender key bundle for groups
        if (data.type === "group-sender-key-bundle") {
          // Secure path: encrypted bundle
          if (data.ciphertext && data.nonce) {
            try {
              const { key: sharedKey } = await deriveSessionKey(
                identity.secretKey,
                data.from
              );
              const plaintext = await decryptMessage(
                sharedKey,
                data.nonce,
                data.ciphertext
              );
              const bundle = JSON.parse(plaintext) as SenderKeyBundle;
              applySenderKeyBundle(bundle);
            } catch (err) {
              console.error(
                "[client] failed to decrypt sender key bundle from",
                data.from,
                err
              );
            }
            return;
          }

          // Legacy/Insecure path (fallback)
          if (data.bundle) {
            const bundle = data.bundle as SenderKeyBundle;
            applySenderKeyBundle(bundle);
            console.log(
              "[client] applied sender-key bundle for group",
              bundle.groupId
            );
            return;
          }
        }

        // 1) Direct + group messages
        if (data.type === "message") {
          const { from, ciphertext, nonce, timestamp, groupId, counter, signature } = data;

          // DIRECT MESSAGE MODE (no groupId): unchanged
          if (!groupId) {
            const contact = contacts.find((c) => c.publicKey === from);
            if (!contact || !contact.sharedKey) {
              console.warn("[client] incoming direct msg from unknown/unshared contact");
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
            return;
          }

          // GROUP MESSAGE MODE (groupId present) → use Sender Keys
          const group = groupChats.find((g) => g.id === groupId);
          if (!group) {
            console.warn("[client] incoming group msg for unknown group", groupId);
            return;
          }

          // decrypt via sender key state, not via contact.sharedKey
          const plaintext = await decryptGroupMessageAsReceiver(
            groupId,
            from,
            counter,
            ciphertext,
            signature
          );

          if (plaintext == null) {
            console.warn("[client] failed to decrypt group message via sender key");
            return;
          }

          if (activeGroupId === groupId) {
            // Lookup sender codename
            const senderContact = contacts.find((c) => c.publicKey === from);
            const senderCodename = senderContact
              ? senderContact.codename
              : `Member-${from.slice(0, 4)}`;

            setMessages((prev) => [
              ...prev,
              {
                id: safeRandomId(),
                direction: "in",
                plaintext,
                timestamp,
                sender: from,
                senderCodename,
              },
            ]);
          }

          // still no disk persistence for group messages for now
          return;
        }


        // 2) Group events (create, rename, membership changes, etc.)
        if (data.type === "group-event") {
          const evt = data.event as GroupEvent;

          // Apply event to local group store
          const updated = applyGroupEvent(
            identity.id,
            identity.publicKey,
            evt
          );
          setGroupChats(updated);

          // 🔸 REMOVED: auto-create contacts for all other members
          // We now rely on ad-hoc session keys (derived via deriveSessionKey)
          // so we don't need to pollute the contact list.

          console.log(
            "[client] applied group-event",
            evt.type,
            "groupId=",
            evt.groupId
          );
          return;
        }
      } catch (err) {
        console.error("[client] ws onmessage error", err);
      }
    };

    setWs(socket);

    return () => {
      try {
        socket?.close();
      } catch { }
      setWs(null);
    };
  }, [
    identity.id,
    identity.publicKey,
    identity.secretKey,   // 🔸 NEW: depends on secretKey too now
    contacts,
    activeContactId,
    groupChats,
    activeGroupId,
  ]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;

    const now = new Date().toISOString();

    // GROUP CHAT MODE
    if (activeGroup) {
      setInput("");

      // optimistic local echo
      setMessages((prev) => [
        ...prev,
        {
          id: safeRandomId(),
          direction: "out",
          plaintext: text,
          timestamp: now,
        },
      ]);

      // 1) Ensure we have a sender key state (in case we didn't already)
      let bundle: SenderKeyBundle;
      try {
        bundle = await ensureSelfSenderKeyState(
          identity.id,
          activeGroup.id,
          identity.publicKey
        );
      } catch (err) {
        console.error(
          "[client] failed to ensure sender key state for group",
          err
        );
        return;
      }
      // 1a) If this is a brand-new sender key, broadcast the bundle
      // 1a) If this is a brand-new sender key, broadcast the bundle
      // SECURELY: Unicast encrypted bundle to each member
      if (ws && ws.readyState === WebSocket.OPEN) {
        const recipients = activeGroup.memberPublicKeys.filter(
          (pk) => pk !== identity.publicKey
        );

        for (const recipientPk of recipients) {
          // We perform ad-hoc ECDH for each recipient
          // This works even if they are NOT in our contacts list (strangers)
          deriveSessionKey(identity.secretKey, recipientPk)
            .then(({ key: sharedKey }) => {
              return encryptMessage(sharedKey, JSON.stringify(bundle));
            })
            .then(({ ciphertext, nonce }) => {
              ws!.send(
                JSON.stringify({
                  type: "group-sender-key-bundle",
                  from: identity.publicKey,
                  to: recipientPk, // unicast
                  ciphertext,
                  nonce,
                })
              );
            })
            .catch((err) => {
              console.warn(
                "[client] failed to send secure bundle to",
                recipientPk,
                err
              );
            });
        }
      }

      // 2) Encrypt once via sender key
      let payload;
      try {
        payload = await encryptGroupMessageAsSender(
          activeGroup.id,
          identity.publicKey,
          text
        );
      } catch (err) {
        console.error(
          "[client] failed to encrypt group message via sender key",
          err
        );
        return;
      }

      const { counter, ciphertext, signature } = payload;

      // 3) Send same ciphertext to each member (server just relays)
      const recipientPks = activeGroup.memberPublicKeys.filter(
        (pk) => pk !== identity.publicKey
      );

      for (const recipientPk of recipientPks) {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "message",
              from: identity.publicKey,
              to: recipientPk,
              ciphertext,
              // nonce no longer needed for sender-key AEAD; keep null for now
              nonce: null,
              timestamp: now,
              groupId: activeGroup.id,
              counter,
              signature,
            })
          );
        } else {
          console.warn("[client] ws not connected, group message not relayed");
        }
      }

      updateIdentityLastActive(identity.id);
      return;
    }

    // DIRECT MESSAGE MODE (unchanged)
    if (!activeContact || !activeContact.sharedKey) return;
    setInput("");

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
    <div className="flex h-screen bg-black text-white font-mono">
      {/* Sidebar */}
      <div
        className={`fixed md:relative z-40 md:z-auto h-full border-r border-neutral-700 bg-neutral-900 transition-all duration-300 overflow-hidden flex flex-col ${sidebarOpen ? "w-80" : "w-0 md:w-80"
          }`}
      >
        <div className="flex flex-col h-full">
          <div className="flex-shrink-0 border-b border-neutral-700 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 animate-pulse rounded-full bg-orange-500" />
                <h1 className="text-xs font-bold tracking-widest text-orange-500 uppercase">
                  CHANNELS
                </h1>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="md:hidden text-neutral-400 hover:text-orange-500 transition-colors p-1 relative z-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex-shrink-0 flex border-b border-neutral-700 bg-neutral-800/30">
            <button
              onClick={() => setViewMode("contacts")}
              className={`flex-1 px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${viewMode === "contacts"
                ? "border-orange-500 text-orange-400"
                : "border-transparent text-neutral-400 hover:text-neutral-300"
                }`}
            >
              DIRECT
            </button>
            <button
              onClick={() => setViewMode("groups")}
              className={`flex-1 px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${viewMode === "groups"
                ? "border-orange-500 text-orange-400"
                : "border-transparent text-neutral-400 hover:text-neutral-300"
                }`}
            >
              GROUPS
            </button>
          </div>

          <div className="flex-1 overflow-y-auto min-w-0">
            {viewMode === "contacts" && (
              <CollapsibleSection title="Contacts" defaultOpen>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-500 font-bold uppercase tracking-wider">
                      Total
                    </span>
                    <span className="text-xs text-orange-400 font-bold bg-orange-500/20 px-2 py-1 rounded">
                      {contacts.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {contacts.length === 0 && (
                      <p className="text-xs text-neutral-500">No contacts yet.</p>
                    )}
                    {contacts.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setActiveContactId(c.id);
                          setActiveGroupId(null);
                          setSidebarOpen(false);
                        }}
                        className={`w-full text-left p-3 rounded border transition-all text-sm relative ${activeContactId === c.id && viewMode === "contacts"
                          ? "border-orange-400 bg-orange-500/20"
                          : "border-neutral-700 hover:border-neutral-600 hover:bg-neutral-800/50"
                          }`}
                      >
                        <div className="font-bold text-white truncate">
                          {c.codename}
                        </div>
                        <div className="truncate text-neutral-500 text-xs mt-1">
                          {c.publicKey.slice(0, 16)}…
                        </div>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowAddContact(true)}
                    className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-bold text-neutral-300 hover:border-orange-500 hover:text-orange-400 transition-colors uppercase tracking-wider"
                  >
                    + ADD CONTACT
                  </button>
                </div>
              </CollapsibleSection>
            )}

            {viewMode === "groups" && (
              <CollapsibleSection title="Group Chats" defaultOpen>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-500 font-bold uppercase tracking-wider">
                      Total
                    </span>
                    <span className="text-xs text-orange-400 font-bold bg-orange-500/20 px-2 py-1 rounded">
                      {groupChats.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {groupChats.length === 0 && (
                      <p className="text-xs text-neutral-500">No groups yet.</p>
                    )}
                    {groupChats.map((group) => (
                      <button
                        key={group.id}
                        onClick={() => {
                          setActiveGroupId(group.id);
                          setActiveContactId(null);
                          setSidebarOpen(false);
                        }}
                        className={`w-full text-left p-3 rounded border transition-all text-sm relative ${activeGroupId === group.id
                          ? "border-orange-400 bg-orange-500/20"
                          : "border-neutral-700 hover:border-neutral-600 hover:bg-neutral-800/50"
                          }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-orange-500/60" />
                          <div className="font-bold text-white truncate">
                            {group.name}
                          </div>
                        </div>
                        <div className="truncate text-neutral-500 text-xs mt-1">
                          {group.memberPublicKeys.length} members
                        </div>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowCreateGroup(true)}
                    className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-bold text-neutral-300 hover:border-orange-500 hover:text-orange-400 transition-colors uppercase tracking-wider"
                  >
                    + CREATE GROUP
                  </button>
                </div>
              </CollapsibleSection>
            )}

            <CollapsibleSection title="Security" defaultOpen={false}>
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-neutral-400 uppercase tracking-wider mb-2 font-bold">
                    My Safety Code
                  </p>
                  <div className="bg-black rounded p-3 border border-neutral-700">
                    <p className="text-sm font-mono text-orange-400 break-all font-semibold">
                      {identityFp ?? "…"}
                    </p>
                  </div>
                </div>
                <div className="rounded border border-neutral-700 bg-neutral-800 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Lock className="h-3 w-3 text-orange-500 flex-shrink-0" />
                    <span className="text-xs font-bold text-orange-400 uppercase tracking-wider">
                      E2E ENCRYPTED
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500">
                    Keys encrypted with your passphrase. Never shared.
                  </p>
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Identity" defaultOpen={false}>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-neutral-400 uppercase tracking-wider mb-2 font-bold">
                    Codename
                  </p>
                  <p className="text-sm font-bold text-orange-400 break-words">
                    {identity.codename}
                  </p>
                </div>
                <CopyButton text={identity.codename} label="codename" />
                <button
                  onClick={() => setShowIdentityDetails(true)}
                  className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-bold text-neutral-300 hover:border-orange-500 hover:text-orange-400 transition-colors uppercase tracking-wider"
                >
                  VIEW FULL PROFILE
                </button>
              </div>
            </CollapsibleSection>
          </div>

          <div className="flex-shrink-0 border-t border-neutral-700 p-4 space-y-2">
            <button
              onClick={onBackToVault}
              className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-bold text-neutral-400 hover:border-orange-500 hover:text-orange-500 transition-colors uppercase tracking-wider"
            >
              SWITCH IDENTITY
            </button>
          </div>
        </div>
      </div>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Identity details modal */}
      {showIdentityDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-lg rounded border border-neutral-700 bg-neutral-900 p-6 font-mono shadow-xl max-h-96 overflow-y-auto">
            <div className="mb-6 flex items-center justify-between pb-4 border-b border-neutral-700">
              <h2 className="text-sm font-bold text-orange-400 uppercase tracking-widest">
                IDENTITY PROFILE
              </h2>
              <button
                onClick={() => setShowIdentityDetails(false)}
                className="text-neutral-400 hover:text-orange-500 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <p className="text-xs text-neutral-400 uppercase tracking-wider mb-3 font-bold">
                  Codename
                </p>
                <div className="bg-black rounded p-3 border border-neutral-700 mb-2">
                  <p className="text-base font-bold text-orange-400 break-words">
                    {identity.codename}
                  </p>
                </div>
                <CopyButton text={identity.codename} label="codename" />
              </div>

              <div>
                <p className="text-xs text-neutral-400 uppercase tracking-wider mb-3 font-bold">
                  Public Key
                </p>
                <div className="bg-black rounded p-3 border border-neutral-700 max-h-20 overflow-y-auto mb-2">
                  <p className="text-xs font-mono text-neutral-400 break-all leading-relaxed">
                    {identity.publicKey}
                  </p>
                </div>
                <CopyButton text={identity.publicKey} label="public key" />
              </div>

              <div>
                <p className="text-xs text-neutral-400 uppercase tracking-wider mb-3 font-bold">
                  Share Identity
                </p>
                <div className="bg-black rounded p-3 border border-neutral-700 max-h-24 overflow-y-auto mb-2">
                  <p className="text-xs font-mono text-neutral-400 break-all leading-relaxed">
                    {contactBundle}
                  </p>
                </div>
                <div className="flex gap-2">
                  <CopyButton text={contactBundle} label="contact bundle" />
                  <button
                    type="button"
                    onClick={() => setShowQr((prev) => !prev)}
                    className="rounded border border-neutral-600 px-3 py-2 text-xs text-neutral-300 hover:border-orange-500 hover:text-orange-400 transition-all hover:bg-orange-500/10 font-semibold uppercase tracking-wide flex-1"
                  >
                    {showQr ? "HIDE QR" : "SHOW QR"}
                  </button>
                </div>

                {showQr && (
                  <div className="flex flex-col items-center gap-2 pt-4 mt-4 border-t border-neutral-700">
                    <div className="bg-white p-2 rounded">
                      <QRCode
                        value={contactBundle}
                        size={140}
                        style={{
                          height: "auto",
                          maxWidth: "100%",
                          width: "100%",
                        }}
                      />
                    </div>
                    <p className="text-xs text-neutral-500 text-center">
                      Scan to share your identity
                    </p>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => setShowIdentityDetails(false)}
              className="w-full mt-6 rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-bold text-neutral-400 hover:border-orange-500 hover:text-orange-500 transition-colors uppercase tracking-wider"
            >
              CLOSE
            </button>
          </div>
        </div>
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col bg-black min-w-0 relative">
        <div className="flex-shrink-0 h-16 flex items-center justify-between border-b border-neutral-700 bg-neutral-900 px-4 md:px-6 relative z-20">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden text-neutral-400 hover:text-orange-500 transition-colors flex-shrink-0 p-1 relative z-50"
            >
              <Menu className="h-5 w-5" />
            </button>
            {activeContact ? (
              <div className="min-w-0">
                <h2 className="text-base font-bold text-white truncate">
                  {activeContact.codename}
                </h2>
                <p className="text-xs text-neutral-400">
                  E2EE ·{" "}
                  <span className="text-orange-400 font-mono font-semibold">
                    {activeContactFp}
                  </span>
                </p>
              </div>
            ) : activeGroup ? (
              <div className="min-w-0">
                <h2 className="text-base font-bold text-white truncate flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-orange-500" />
                  {activeGroup.name}
                </h2>
                <p className="text-xs text-neutral-400">
                  E2EE ·{" "}
                  <span className="text-orange-400 font-mono">
                    {activeGroup.memberPublicKeys.length} members
                  </span>
                </p>
              </div>
            ) : (
              <div className="text-sm text-neutral-500">
                Select a contact or group to start
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Lock className="h-4 w-4 text-orange-500" />
            <span className="text-xs font-bold text-orange-500 hidden sm:inline uppercase">
              ACTIVE
            </span>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {!activeContact && !activeGroup && (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded border border-neutral-700 bg-neutral-800">
                    <Lock className="h-8 w-8 text-neutral-600" />
                  </div>
                  <p className="text-base text-neutral-300 font-semibold">
                    Select a contact or group
                  </p>
                  <p className="mt-2 text-sm text-neutral-500">
                    to start secure communication
                  </p>
                </div>
              </div>
            )}

            {(activeContact || activeGroup) && loadingMessages && (
              <p className="text-sm text-neutral-500 font-semibold">
                DECRYPTING MESSAGES…
              </p>
            )}

            {(activeContact || activeGroup) &&
              !loadingMessages &&
              groupedMessages.map((group, idx) => (
                <MessageGroup
                  key={idx}
                  messages={group.messages}
                  direction={group.direction}
                  senderCodename={group.senderCodename}
                />
              ))}

            {(activeContact || activeGroup) &&
              !loadingMessages &&
              messages.length === 0 && (
                <p className="text-sm text-neutral-500 font-semibold">
                  No messages. Start a conversation.
                </p>
              )}

            <div ref={messagesEndRef} />
          </div>

          {(activeContact || activeGroup) && (
            <div className="flex-shrink-0 border-t border-neutral-700 bg-neutral-900 p-5">
              <div className="flex items-end gap-3">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Type message…"
                  className="flex-1 rounded border border-neutral-700 bg-black px-4 py-3 text-sm font-mono text-white placeholder-neutral-600 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30 resize-none max-h-20 transition-all hover:border-neutral-600"
                />
                <button
                  onClick={handleSend}
                  disabled={
                    !input.trim() ||
                    (!activeContact?.sharedKey && !activeGroup)
                  }
                  className="flex h-11 w-11 items-center justify-center rounded bg-orange-500 text-black hover:bg-orange-400 transition-all hover:shadow-lg hover:shadow-orange-500/50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none flex-shrink-0 font-bold"
                >
                  <Send className="h-5 w-5" />
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-neutral-500">
                <Lock className="h-3 w-3 text-orange-500 flex-shrink-0" />
                <span className="font-semibold">End-to-end encrypted</span>
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

      {showCreateGroup && (
        <CreateGroupModal
          identity={identity}
          contacts={contacts}
          onClose={() => setShowCreateGroup(false)}
          onCreated={(group) => {
            // refresh local list from store
            setGroupChats(loadGroups(identity.id));

            // broadcast group creation to other members
            if (ws && ws.readyState === WebSocket.OPEN) {
              const evt: GroupEvent = {
                type: "create",
                groupId: group.id,
                name: group.name,
                members: group.memberPublicKeys,
              };

              // don't send to myself
              const recipients = group.memberPublicKeys.filter(
                (pk) => pk !== identity.publicKey
              );

              if (recipients.length > 0) {
                ws.send(
                  JSON.stringify({
                    type: "group-event",
                    from: identity.publicKey,
                    to: recipients,
                    event: evt,
                  })
                );
              }
            }
          }}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────
// Root Page
// ───────────────────────────────────────────────

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
    // Run once in browser to clean any old duplicate contacts
    if (typeof window !== "undefined") {
      dedupeAllContacts();
    }

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
      <div className="flex h-screen items-center justify-center bg-black text-orange-400 font-mono overflow-hidden relative">

        <div className="absolute inset-0 pointer-events-none bg-repeat opacity-10" style={{
          backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.1) 0px, rgba(0,0,0,0.1) 1px, transparent 1px, transparent 2px)',
          animation: 'crt-flicker 0.15s infinite'
        }} />

        {/* --- Main Content --- */}
        <div className="z-10 relative w-full max-w-lg px-4"> {/* Container widened */}

          {/* Title */}
          <div className="mb-10 text-center relative">
            <h1 className="text-4xl md:text-5xl font-bold tracking-widest mb-2 glitch-text" data-text="CIPHER NODE">
              CIPHER NODE
            </h1>
            <div className="h-0.5 bg-gradient-to-r from-transparent via-orange-500 to-transparent mx-auto w-2/3" />
          </div>

          {/* --- NEW: TERMINAL WINDOW --- */}
          <div className="w-full border border-orange-500/50 bg-black/90 shadow-[0_0_20px_rgba(234,88,12,0.2)] rounded-md overflow-hidden backdrop-blur-sm">

            {/* Terminal Header Bar */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-orange-900/20 border-b border-orange-500/30">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
              </div>
              <div className="text-xs text-orange-300/70 tracking-wider font-semibold">root@cipher-node:~</div>
              <div className="w-8" /> {/* Spacer for centering */}
            </div>

            {/* Terminal Body */}
            <div className="p-4 h-64 overflow-y-auto font-mono text-sm md:text-base space-y-1">
              <div className="text-orange-300 opacity-70">$ ./init_sequence.sh</div>
              <div className="text-green-400">[OK] Verifying environment integrity...</div>
              <div className="text-green-400">[OK] Loading cryptographic modules (AES-256)...</div>
              <div className="text-green-400">[OK] Establishing P2P handshake...</div>
              <div className="text-orange-400">[WARN] Latency detected in sector 7G... bypassing.</div>
              <div className="text-green-400">[OK] Session keys generated.</div>
              <div className="flex items-center gap-2 text-orange-500 mt-2">
                <span>$ booting_interface</span>
                {/* Blinking Cursor */}
                <span className="inline-block w-2.5 h-4 bg-orange-500 animate-cursor-blink" />
              </div>
            </div>
          </div>

          {/* Bottom Status Indicators (Simplified) */}
          <div className="mt-6 flex justify-between items-center text-xs text-orange-400/60 uppercase tracking-widest px-2">
            <span>Encrypted Connection</span>
            <span className="animate-pulse">Standby...</span>
          </div>

        </div>
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
    <ToastProvider>
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
    </ToastProvider>
  );
}
