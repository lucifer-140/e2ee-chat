"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Contact } from "@/lib/contacts/store";
import { getPublicKeyFingerprint } from "@/lib/crypto/fingerprint";
import { CopyButton } from "@/components/ui/CopyButton";

export function ContactInfoModal({
    contact,
    onClose,
    onClearHistory,
    onDelete,
}: {
    contact: Contact;
    onClose: () => void;
    onClearHistory: () => void;
    onDelete: () => void;
}) {
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [fingerprint, setFingerprint] = useState<string | null>(null);

    useEffect(() => {
        getPublicKeyFingerprint(contact.publicKey).then(setFingerprint);
    }, [contact.publicKey]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
            <div className="w-full max-w-sm rounded border border-neutral-700 bg-neutral-900 p-6 font-mono shadow-xl">
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-neutral-700">
                    <h2 className="text-sm font-bold text-orange-400 uppercase tracking-widest">
                        CONTACT INFO
                    </h2>
                    <button onClick={onClose} className="text-neutral-500 hover:text-white">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="space-y-6">
                    <div>
                        <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider block mb-1">
                            Codename
                        </label>
                        <div className="text-lg font-bold text-white">{contact.codename}</div>
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider block mb-1">
                            Public Key Fingerprint
                        </label>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 rounded bg-black px-2 py-1 text-xs text-orange-400 font-mono break-all border border-neutral-800">
                                {fingerprint || "..."}
                            </code>
                            <CopyButton
                                text={contact.publicKey}
                                label="Public Key"
                            />
                        </div>
                    </div>

                    <div className="pt-4 border-t border-neutral-800 space-y-3">
                        <button
                            onClick={onClearHistory}
                            className="w-full rounded border border-neutral-700 bg-neutral-800 px-4 py-3 text-sm font-bold text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors"
                        >
                            CLEAR CHAT HISTORY
                        </button>

                        {!confirmDelete ? (
                            <button
                                onClick={() => setConfirmDelete(true)}
                                className="w-full rounded border border-red-900/30 bg-red-950/20 px-4 py-3 text-sm font-bold text-red-500 hover:bg-red-900/40 transition-colors"
                            >
                                DELETE CONTACT
                            </button>
                        ) : (
                            <div className="space-y-2 animate-in fade-in zoom-in duration-200">
                                <p className="text-xs text-red-400 text-center font-bold">
                                    ARE YOU SURE? THIS CANNOT BE UNDONE.
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setConfirmDelete(false)}
                                        className="flex-1 rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-bold text-neutral-400 hover:text-white"
                                    >
                                        CANCEL
                                    </button>
                                    <button
                                        onClick={onDelete}
                                        className="flex-1 rounded bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-500"
                                    >
                                        CONFIRM DELETE
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
