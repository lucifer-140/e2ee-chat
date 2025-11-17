// src/components/identity/IdentityVault.tsx
"use client";

import { Lock } from "lucide-react";
import { StoredIdentity } from "@/lib/identities/store";

interface Props {
  identities: StoredIdentity[];
  onActivate: (id: StoredIdentity) => void;
  onCreateNew: () => void;
  onDelete: (id: StoredIdentity) => void;
}

export default function IdentityVault({
  identities,
  onActivate,
  onCreateNew,
  onDelete,
}: Props) {
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
