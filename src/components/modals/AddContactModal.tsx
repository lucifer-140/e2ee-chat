"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { UnlockedIdentity } from "@/lib/identities/store";
import { addContact } from "@/lib/contacts/store";

export function AddContactModal({
    identity,
    initialPublicKey,
    onClose,
    onAdded,
}: {
    identity: UnlockedIdentity;
    initialPublicKey?: string;
    onClose: () => void;
    onAdded: () => void;
}) {
    const [input, setInput] = useState(initialPublicKey || "");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleAdd = async () => {
        setError(null);
        const trimmed = input.trim();
        if (!trimmed) {
            setError("Please enter a public key or bundle");
            return;
        }

        setLoading(true);
        try {
            let publicKey = trimmed;
            let codename = "";

            // Parse bundle if applicable
            if (trimmed.startsWith("e2ee-contact:v1:")) {
                try {
                    const json = trimmed.replace("e2ee-contact:v1:", "");
                    const parsed = JSON.parse(json);
                    if (parsed.publicKey) {
                        publicKey = parsed.publicKey;
                        codename = parsed.codename || "";
                    }
                } catch {
                    setError("Invalid contact bundle format");
                    setLoading(false);
                    return;
                }
            }

            if (publicKey === identity.publicKey) {
                setError("You cannot add yourself as a contact");
                setLoading(false);
                return;
            }

            addContact(identity.id, identity.secretKey, codename, publicKey);
            toast.success("Contact added successfully");
            onAdded();
            onClose();
        } catch (err) {
            console.error(err);
            setError("Failed to add contact. Check the key format.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
            <div className="w-full max-w-md rounded border border-neutral-700 bg-neutral-900 p-6 font-mono shadow-xl">
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-neutral-700">
                    <h2 className="text-sm font-bold text-orange-400 uppercase tracking-widest">
                        ADD NEW CONTACT
                    </h2>
                    <button onClick={onClose} className="text-neutral-500 hover:text-white">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {error && (
                    <div className="mb-4 rounded border border-red-900/50 bg-red-900/20 p-3 text-xs text-red-400">
                        {error}
                    </div>
                )}

                <div className="space-y-4">
                    <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                        Public Key or Contact Bundle
                    </label>
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Paste public key or e2ee-contact:v1:..."
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
        </div>
    );
}
