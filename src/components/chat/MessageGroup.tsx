"use client";

import { Lock, UserPlus } from "lucide-react";
import { getPublicKeyFingerprint } from "@/lib/crypto/fingerprint";
import { useEffect, useState } from "react";

export interface DecryptedMessage {
    id: string;
    direction: "in" | "out";
    plaintext: string;
    timestamp: number;
    sender?: string; // public key
}

export function MessageGroup({
    messages,
    direction,
    senderCodename,
    isContact,
    senderPublicKey,
    onAddContact,
}: {
    messages: DecryptedMessage[];
    direction: "in" | "out";
    senderCodename?: string;
    isContact?: boolean;
    senderPublicKey?: string;
    onAddContact?: (pk: string) => void;
}) {
    const [fingerprint, setFingerprint] = useState<string | null>(null);

    useEffect(() => {
        if (senderPublicKey) {
            getPublicKeyFingerprint(senderPublicKey).then(setFingerprint);
        }
    }, [senderPublicKey]);

    return (
        <div
            className={`mb-4 flex flex-col ${direction === "out" ? "items-end" : "items-start"
                }`}
        >
            {direction === "in" && senderCodename && (
                <div className="mb-1 ml-1 flex items-center gap-2">
                    <span className="text-xs font-bold text-orange-400">
                        {senderCodename}
                    </span>
                    {senderPublicKey && !isContact && onAddContact && (
                        <button
                            onClick={() => onAddContact(senderPublicKey)}
                            className="flex items-center gap-1 rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-bold text-neutral-400 hover:bg-neutral-700 hover:text-white transition-colors uppercase tracking-wide"
                        >
                            <UserPlus className="h-3 w-3" />
                            ADD
                        </button>
                    )}
                </div>
            )}

            <div
                className={`flex max-w-[85%] flex-col gap-1 ${direction === "out" ? "items-end" : "items-start"
                    }`}
            >
                {messages.map((msg, i) => {
                    const isLast = i === messages.length - 1;
                    const isFirst = i === 0;
                    const roundedClass =
                        direction === "out"
                            ? `${isFirst ? "rounded-tr-2xl" : "rounded-tr-md"} ${isLast ? "rounded-br-2xl" : "rounded-br-md"
                            } rounded-l-2xl`
                            : `${isFirst ? "rounded-tl-2xl" : "rounded-tl-md"} ${isLast ? "rounded-bl-2xl" : "rounded-bl-md"
                            } rounded-r-2xl`;

                    return (
                        <div
                            key={msg.id}
                            className={`relative px-4 py-2 text-sm shadow-sm ${direction === "out"
                                ? "bg-orange-500 text-black"
                                : "bg-neutral-800 text-white"
                                } ${roundedClass}`}
                        >
                            <div className="whitespace-pre-wrap break-words font-sans leading-relaxed">
                                {msg.plaintext}
                            </div>
                            <div
                                className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${direction === "out" ? "text-orange-900/60" : "text-neutral-500"
                                    }`}
                            >
                                <span>
                                    {new Date(msg.timestamp).toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    })}
                                </span>
                                {direction === "out" && <Lock className="h-2.5 w-2.5" />}
                            </div>
                        </div>
                    );
                })}
            </div>
            {direction === "in" && senderPublicKey && fingerprint && (
                <div className="ml-1 mt-1 text-[10px] font-mono text-neutral-600">
                    fp: {fingerprint}
                </div>
            )}
        </div>
    );
}
