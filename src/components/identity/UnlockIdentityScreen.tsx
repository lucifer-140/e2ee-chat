// src/components/identity/UnlockIdentityScreen.tsx
"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import {
  StoredIdentity,
  UnlockedIdentity,
  unlockIdentity,
} from "@/lib/identities/store";

interface Props {
  identity: StoredIdentity;
  onUnlocked: (id: UnlockedIdentity) => void;
  onCancel: () => void;
}

export default function UnlockIdentityScreen({
  identity,
  onUnlocked,
  onCancel,
}: Props) {
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
