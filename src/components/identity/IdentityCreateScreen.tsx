"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { createIdentity, UnlockedIdentity } from "@/lib/identities/store";

export function IdentityCreateScreen({
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
