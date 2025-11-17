// src/components/identity/IdentityCreateScreen.tsx
"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import {
  UnlockedIdentity,
  createIdentity,
} from "@/lib/identities/store";

interface Props {
  onCreated: (id: UnlockedIdentity) => void;
  onBackToVaultIfAny: () => void;
  hasExisting: boolean;
}

export default function IdentityCreateScreen({
  onCreated,
  onBackToVaultIfAny,
  hasExisting,
}: Props) {
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
