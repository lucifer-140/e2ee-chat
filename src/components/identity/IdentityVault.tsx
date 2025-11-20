"use client";

import { Lock } from "lucide-react";
import { StoredIdentity } from "@/lib/identities/store";

export function IdentityVault({
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
