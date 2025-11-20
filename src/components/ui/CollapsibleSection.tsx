"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export function CollapsibleSection({
    title,
    defaultOpen = false,
    children,
}: {
    title: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <div className="border-b border-neutral-700">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between p-4 text-sm font-bold text-orange-400 uppercase tracking-widest hover:bg-neutral-800/70 transition-colors"
            >
                {title}
                <ChevronDown
                    className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""
                        }`}
                />
            </button>
            {open && (
                <div className="px-4 py-3 space-y-3 bg-neutral-900/50 border-t border-neutral-700">
                    {children}
                </div>
            )}
        </div>
    );
}
