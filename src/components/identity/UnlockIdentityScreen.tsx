"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { StoredIdentity, UnlockedIdentity, unlockIdentity } from "@/lib/identities/store";

export function UnlockIdentityScreen({
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
