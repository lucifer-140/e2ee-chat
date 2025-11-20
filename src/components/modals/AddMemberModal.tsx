"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Contact } from "@/lib/contacts/store";
import { GroupChat } from "@/lib/groups/store";

export function AddMemberModal({
    group,
    contacts,
    onClose,
    onAdd,
}: {
    group: GroupChat;
    contacts: Contact[];
    onClose: () => void;
    onAdd: (publicKey: string) => void;
}) {
    const [selectedPk, setSelectedPk] = useState<string | null>(null);

    // Filter out existing members
    const availableContacts = contacts.filter(
        (c) => !group.memberPublicKeys.includes(c.publicKey)
    );

    const handleAdd = () => {
        if (!selectedPk) return;
        onAdd(selectedPk);
        toast.success("Member added");
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
            <div className="w-full max-w-sm rounded border border-neutral-700 bg-neutral-900 p-6 font-mono shadow-xl">
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-neutral-700">
                    <h2 className="text-sm font-bold text-orange-400 uppercase tracking-widest">
                        ADD MEMBER
                    </h2>
                    <button onClick={onClose} className="text-neutral-500 hover:text-white">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="space-y-4">
                    {availableContacts.length === 0 ? (
                        <p className="text-sm text-neutral-500">
                            No available contacts to add.
                        </p>
                    ) : (
                        <div className="max-h-60 overflow-y-auto space-y-2">
                            {availableContacts.map((c) => (
                                <button
                                    key={c.id}
                                    onClick={() => setSelectedPk(c.publicKey)}
                                    className={`w-full text-left p-3 rounded border transition-all text-sm ${selectedPk === c.publicKey
                                        ? "border-orange-400 bg-orange-500/20"
                                        : "border-neutral-700 hover:border-neutral-600 hover:bg-neutral-800"
                                        }`}
                                >
                                    <div className="font-bold text-white">{c.codename}</div>
                                    <div className="text-xs text-neutral-500 truncate">
                                        {c.publicKey}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="mt-6 flex justify-end gap-2">
                        <button
                            onClick={onClose}
                            className="px-3 py-2 text-xs font-medium text-neutral-400 hover:text-white transition-colors"
                        >
                            CANCEL
                        </button>
                        <button
                            onClick={handleAdd}
                            disabled={!selectedPk}
                            className="rounded bg-orange-500 px-4 py-2 text-xs font-bold text-black hover:bg-orange-400 transition-colors disabled:opacity-50"
                        >
                            ADD MEMBER
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
