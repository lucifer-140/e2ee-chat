"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/utils/clipboard";

export function CopyButton({ text, label }: { text: string; label?: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        copyToClipboard(text, label);
        setCopied(true);
        toast.success(`Copied ${label || "text"} to clipboard`);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button
            type="button"
            onClick={handleCopy}
            className="rounded border border-neutral-600 px-3 py-2 text-xs text-neutral-300 hover:border-orange-500 hover:text-orange-400 transition-all hover:bg-orange-500/10 font-semibold uppercase tracking-wide"
        >
            {copied ? (
                <>
                    <Check className="h-3 w-3 inline mr-1" />
                    COPIED
                </>
            ) : (
                <>
                    <Copy className="h-3 w-3 inline mr-1" />
                    COPY
                </>
            )}
        </button>
    );
}
