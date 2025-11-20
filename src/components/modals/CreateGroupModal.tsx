"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { UnlockedIdentity } from "@/lib/identities/store";
import { Contact } from "@/lib/contacts/store";
import { createGroup, GroupChat } from "@/lib/groups/store";

export function CreateGroupModal({
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

    const handleCreate = async () => {
        setError(null);
        if (!name.trim()) {
            setError("Group name is required");
            return;
        }
        if (selected.size === 0) {
            setError("Select at least one member");
            return;
        }

        setLoading(true);
        try {
            const initialMembers = Array.from(selected);
            // Create locally
            const group = createGroup(
                identity.id,
                name.trim(),
                [identity.publicKey, ...initialMembers]
            );

            toast.success("Group created");
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
            <div className="w-full max-w-md rounded border border-neutral-700 bg-neutral-900 p-6 font-mono shadow-xl">
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-neutral-700">
                    <h2 className="text-sm font-bold text-orange-400 uppercase tracking-widest">
                        CREATE NEW GROUP
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
                    <div>
                        <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                            Group Name
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Project Alpha"
                            className="w-full rounded border border-neutral-700 bg-black px-3 py-2 text-sm font-mono text-white outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                            Add Members ({selected.size})
                        </label>
                        <div className="max-h-48 overflow-y-auto rounded border border-neutral-700 bg-black p-2 space-y-1">
                            {contacts.length === 0 && (
                                <p className="text-xs text-neutral-500 p-2">
                                    No contacts available.
                                </p>
                            )}
                            {contacts.map((c) => {
                                const isSelected = selected.has(c.publicKey);
                                return (
                                    <button
                                        key={c.id}
                                        onClick={() => toggleContact(c.publicKey)}
                                        className={`w-full flex items-center justify-between p-2 rounded text-xs transition-colors ${isSelected
                                            ? "bg-orange-500/20 text-orange-400"
                                            : "hover:bg-neutral-800 text-neutral-300"
                                            }`}
                                    >
                                        <span className="font-bold truncate">{c.codename}</span>
                                        {isSelected && <div className="h-2 w-2 bg-orange-500 rounded-full" />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="mt-6 flex justify-end gap-2">
                        <button
                            onClick={onClose}
                            className="px-3 py-2 text-xs font-medium text-neutral-400 hover:text-white transition-colors"
                        >
                            CANCEL
                        </button>
                        <button
                            onClick={handleCreate}
                            disabled={loading}
                            className="rounded bg-orange-500 px-4 py-2 text-xs font-bold text-black hover:bg-orange-400 transition-colors disabled:opacity-50"
                        >
                            {loading ? "CREATING…" : "CREATE GROUP"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
