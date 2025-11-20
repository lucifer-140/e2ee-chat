"use client";

import { useState } from "react";
import { X, LogOut, UserPlus, Trash2 } from "lucide-react";
import { UnlockedIdentity } from "@/lib/identities/store";
import { Contact } from "@/lib/contacts/store";
import { GroupChat } from "@/lib/groups/store";
import { CopyButton } from "@/components/ui/CopyButton";

export function GroupInfoModal({
    group,
    identity,
    contacts,
    onClose,
    onLeave,
    onKick,
    onAddMember,
}: {
    group: GroupChat;
    identity: UnlockedIdentity;
    contacts: Contact[];
    onClose: () => void;
    onLeave: () => void;
    onKick: (publicKey: string) => void;
    onAddMember: () => void;
}) {
    const [confirmLeave, setConfirmLeave] = useState(false);

    const isCreator = group.creatorPublicKey === identity.publicKey;

    // Helper to resolve name
    const getMemberName = (pk: string) => {
        if (pk === identity.publicKey) return "You";
        const c = contacts.find((c) => c.publicKey === pk);
        return c ? c.codename : `Member-${pk.slice(0, 6)}`;
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
            <div className="w-full max-w-md rounded border border-neutral-700 bg-neutral-900 p-6 font-mono shadow-xl max-h-[80vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-neutral-700">
                    <h2 className="text-sm font-bold text-orange-400 uppercase tracking-widest">
                        GROUP INFO
                    </h2>
                    <button onClick={onClose} className="text-neutral-500 hover:text-white">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="space-y-6">
                    <div>
                        <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider block mb-1">
                            Group Name
                        </label>
                        <div className="text-lg font-bold text-white">{group.name}</div>
                        <div className="text-xs text-neutral-500 mt-1">ID: {group.id}</div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                                Members ({group.memberPublicKeys.length})
                            </label>
                            {isCreator && (
                                <button
                                    onClick={onAddMember}
                                    className="flex items-center gap-1 text-xs font-bold text-orange-400 hover:text-orange-300 transition-colors"
                                >
                                    <UserPlus className="h-3 w-3" />
                                    ADD
                                </button>
                            )}
                        </div>
                        <div className="bg-black rounded border border-neutral-700 overflow-hidden">
                            {group.memberPublicKeys.map((pk) => (
                                <div
                                    key={pk}
                                    className="flex items-center justify-between p-3 border-b border-neutral-800 last:border-0"
                                >
                                    <div className="min-w-0 flex-1 mr-2">
                                        <div className="text-sm font-bold text-white truncate">
                                            {getMemberName(pk)}
                                        </div>
                                        <div className="text-xs text-neutral-600 truncate font-mono">
                                            {pk.slice(0, 16)}…
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <CopyButton text={pk} label="Key" />
                                        {isCreator && pk !== identity.publicKey && (
                                            <button
                                                onClick={() => onKick(pk)}
                                                className="p-1 text-neutral-500 hover:text-red-500 transition-colors"
                                                title="Kick Member"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        )}
                                        {pk === group.creatorPublicKey && (
                                            <span className="text-[10px] font-bold bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded uppercase">
                                                ADMIN
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="pt-4 border-t border-neutral-800">
                        {!confirmLeave ? (
                            <button
                                onClick={() => setConfirmLeave(true)}
                                className="w-full flex items-center justify-center gap-2 rounded border border-red-900/30 bg-red-950/20 px-4 py-3 text-sm font-bold text-red-500 hover:bg-red-900/40 transition-colors"
                            >
                                <LogOut className="h-4 w-4" />
                                LEAVE GROUP
                            </button>
                        ) : (
                            <div className="space-y-2 animate-in fade-in zoom-in duration-200">
                                <p className="text-xs text-red-400 text-center font-bold">
                                    LEAVING WILL DELETE LOCAL HISTORY. CONFIRM?
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setConfirmLeave(false)}
                                        className="flex-1 rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-bold text-neutral-400 hover:text-white"
                                    >
                                        CANCEL
                                    </button>
                                    <button
                                        onClick={onLeave}
                                        className="flex-1 rounded bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-500"
                                    >
                                        CONFIRM LEAVE
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
