"use client";

import { useState, useEffect, useRef } from "react";
import {
    Menu,
    Send,
    Lock,
    X,
    MoreVertical,
} from "lucide-react";
import { toast } from "sonner";
import QRCode from "react-qr-code";

import {
    UnlockedIdentity,
    updateIdentityLastActive,
} from "@/lib/identities/store";
import {
    Contact,
    loadContacts,
    deleteContact,
} from "@/lib/contacts/store";
import {
    GroupChat,
    loadGroups,
    applyGroupEvent,
    GroupEvent,
} from "@/lib/groups/store";
import {
    addMessage,
    loadMessagesForContact,
    loadMessagesForGroup,
    deleteMessagesForContacts,
    deleteMessagesForGroup,
} from "@/lib/messages/store";
import {
    encryptMessage,
    decryptMessage,
    deriveSessionKey,
    encryptGroupMessageAsSender,
    decryptGroupMessageAsSender,
} from "../../lib/crypto/sodium";
import { getPublicKeyFingerprint } from "@/lib/crypto/fingerprint";

import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { CopyButton } from "@/components/ui/CopyButton";
import { MessageGroup, DecryptedMessage } from "@/components/chat/MessageGroup";
import { AddContactModal } from "@/components/modals/AddContactModal";
import { CreateGroupModal } from "@/components/modals/CreateGroupModal";
import { GroupInfoModal } from "@/components/modals/GroupInfoModal";
import { AddMemberModal } from "@/components/modals/AddMemberModal";
import { ContactInfoModal } from "@/components/modals/ContactInfoModal";

// --- Types ---
type ViewMode = "contacts" | "groups";

interface ChatShellProps {
    identity: UnlockedIdentity;
    onBackToVault: () => void;
}

export function ChatShell({ identity, onBackToVault }: ChatShellProps) {
    // --- State ---
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>("contacts");

    const [contacts, setContacts] = useState<Contact[]>([]);
    const [groupChats, setGroupChats] = useState<GroupChat[]>([]);

    const [activeContactId, setActiveContactId] = useState<string | null>(null);
    const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

    const [messages, setMessages] = useState<DecryptedMessage[]>([]);
    const [input, setInput] = useState("");

    // Modals
    const [showIdentityDetails, setShowIdentityDetails] = useState(false);
    const [showAddContact, setShowAddContact] = useState(false);
    const [addContactPrefill, setAddContactPrefill] = useState<{
        publicKey: string;
    } | null>(null);
    const [showCreateGroup, setShowCreateGroup] = useState(false);
    const [showGroupInfo, setShowGroupInfo] = useState(false);
    const [showAddMember, setShowAddMember] = useState(false);
    const [showContactInfo, setShowContactInfo] = useState(false);

    // QR / Identity
    const [showQr, setShowQr] = useState(false);
    const [identityFp, setIdentityFp] = useState<string | null>(null);
    const [activeContactFp, setActiveContactFp] = useState<string | null>(null);

    // WebSocket
    const [ws, setWs] = useState<WebSocket | null>(null);

    // Refs
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Derived
    const activeContact = contacts.find((c) => c.id === activeContactId);
    const activeGroup = groupChats.find((g) => g.id === activeGroupId);

    // Cache stranger codenames to display nicely in UI
    const [strangerCodenames, setStrangerCodenames] = useState<
        Record<string, string>
    >({});

    // --- Effects ---

    // 1. Load initial data
    useEffect(() => {
        setContacts(loadContacts(identity.id));
        setGroupChats(loadGroups(identity.id));
        getPublicKeyFingerprint(identity.publicKey).then(setIdentityFp);
    }, [identity.id, identity.publicKey]);

    // 2. Connect WebSocket
    useEffect(() => {
        const socket = new WebSocket("ws://localhost:4000");

        socket.onopen = () => {
            // Register
            socket.send(
                JSON.stringify({
                    type: "register",
                    publicKey: identity.publicKey,
                })
            );
        };

        socket.onmessage = async (event) => {
            try {
                const data = JSON.parse(event.data);

                // A) Direct Message
                if (data.type === "message" && !data.groupId) {
                    // 1. Find sender contact
                    const sender = loadContacts(identity.id).find(
                        (c) => c.publicKey === data.from
                    );
                    if (!sender) {
                        // Message from stranger -> ignore or handle differently
                        return;
                    }

                    // 2. Decrypt
                    if (!sender.sharedKey) return;
                    try {
                        const plaintext = await decryptMessage(
                            sender.sharedKey,
                            data.nonce,
                            data.ciphertext
                        );

                        // 3. Persist
                        const stored = addMessage(
                            sender.id,
                            "direct",
                            "in",
                            data.ciphertext,
                            data.nonce,
                            data.from
                        );

                        // 4. Update UI if active
                        if (activeContactId === sender.id) {
                            setMessages((prev) => [
                                ...prev,
                                {
                                    id: stored.id,
                                    direction: "in",
                                    plaintext,
                                    timestamp: new Date(stored.timestamp).getTime(),
                                    sender: data.from,
                                },
                            ]);
                        } else {
                            toast("New message from " + sender.codename);
                        }
                    } catch (err) {
                        console.error("Decryption failed", err);
                    }
                }

                // B) Group Message
                else if (data.type === "message" && data.groupId) {
                    const groups = loadGroups(identity.id);
                    const group = groups.find((g) => g.id === data.groupId);
                    if (!group) return; // unknown group

                    // 1. Decrypt using Sender Key
                    try {
                        if (!data.ciphertext) return; // Safety check

                        // We need the sender's public key to find the right session
                        const plaintext = await decryptGroupMessageAsSender(
                            group.id,
                            data.from,
                            data.ciphertext,
                            data.counter,
                            data.signature
                        );

                        // 2. Persist
                        const stored = addMessage(
                            group.id,
                            "group",
                            "in",
                            plaintext, // storing plaintext for local retrieval
                            undefined,
                            data.from
                        );

                        // 3. Update UI
                        if (activeGroupId === group.id) {
                            setMessages((prev) => [
                                ...prev,
                                {
                                    id: stored.id,
                                    direction: "in",
                                    plaintext,
                                    timestamp: new Date(stored.timestamp).getTime(),
                                    sender: data.from,
                                },
                            ]);
                        }
                    } catch (err) {
                        console.error("Group message decryption failed", err);
                    }
                }

                // C) Group Event (create, add, leave, kick)
                else if (data.type === "group-event") {
                    const evt = data.event as GroupEvent;
                    // Apply to local store
                    const updatedGroups = applyGroupEvent(
                        identity.id,
                        identity.publicKey,
                        evt
                    );
                    setGroupChats(updatedGroups);

                    // If I was added/kicked, show toast
                    if (evt.type === "add") {
                        toast.info(`Group update: ${evt.groupName || "Unknown Group"}`);
                    } else if (evt.type === "kick") {
                        if (evt.targetPublicKey === identity.publicKey) {
                            toast.error("You were removed from a group");
                            if (activeGroupId === evt.groupId) {
                                setActiveGroupId(null);
                            }
                            // Clear history for this group
                            deleteMessagesForGroup(evt.groupId);
                        }
                    } else if (evt.type === "leave") {
                        if (evt.publicKey === identity.publicKey) {
                            // I left (e.g. from another device), clear local history
                            deleteMessagesForGroup(evt.groupId);
                            if (activeGroupId === evt.groupId) {
                                setActiveGroupId(null);
                            }
                        }
                    }
                }

                // D) Sender Key Bundle (for group encryption)
                else if (data.type === "group-sender-key-bundle") {
                    // 1. Decrypt the bundle using 1:1 ECDH
                    try {
                        const { key: sharedKey } = await deriveSessionKey(
                            identity.secretKey,
                            data.from
                        );
                        const bundleJson = await decryptMessage(
                            sharedKey,
                            data.nonce,
                            data.ciphertext
                        );
                        const bundle = JSON.parse(bundleJson);

                        // 2. Import the sender key state
                        const { importSenderKeyState } = await import(
                            "../../lib/crypto/sodium"
                        );
                        await importSenderKeyState(
                            bundle.groupId,
                            data.from, // sender of the bundle
                            bundle.senderKeyState
                        );

                        // 3. Cache codename if present
                        if (bundle.senderCodename) {
                            setStrangerCodenames((prev) => ({
                                ...prev,
                                [data.from]: bundle.senderCodename,
                            }));
                        }
                    } catch (err) {
                        console.error("Failed to process sender key bundle", err);
                    }
                }
            } catch (err) {
                console.error("WS message error", err);
            }
        };

        setWs(socket);

        return () => {
            socket.close();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [identity, activeContactId, activeGroupId]);

    // 3. Load messages when active chat changes
    useEffect(() => {
        setMessages([]);
        setActiveContactFp(null);

        if (activeContact) {
            if (activeContact.publicKey) {
                getPublicKeyFingerprint(activeContact.publicKey).then(setActiveContactFp);
            }

            if (activeContact.sharedKey) {
                loadAndDecryptMessages(activeContact.id, "direct", activeContact.sharedKey)
                    .then(setMessages)
            } else {
            }
        } else if (activeGroup) {
            const raw = loadMessagesForGroup(activeGroup.id);
            const formatted: DecryptedMessage[] = raw.map((m) => ({
                id: m.id,
                direction: m.direction,
                plaintext: m.plaintext || "",
                timestamp: new Date(m.timestamp).getTime(),
                sender: m.sender,
            }));
            setMessages(formatted);
        }
    }, [activeContactId, activeGroupId, contacts, groupChats]);

    // 4. Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // --- Helpers ---

    async function loadAndDecryptMessages(
        contactId: string,
        type: "direct",
        sharedKey: string
    ) {
        const raw = loadMessagesForContact(contactId);
        const decrypted: DecryptedMessage[] = [];

        for (const m of raw) {
            if (m.direction === "out") {
                try {
                    if (!m.nonce || !m.ciphertext) {
                        decrypted.push({
                            id: m.id,
                            direction: "out",
                            plaintext: m.ciphertext || m.plaintext || "",
                            timestamp: new Date(m.timestamp).getTime(),
                        });
                        continue;
                    }
                    const text = await decryptMessage(sharedKey, m.nonce, m.ciphertext);
                    decrypted.push({
                        id: m.id,
                        direction: "out",
                        plaintext: text,
                        timestamp: new Date(m.timestamp).getTime(),
                    });
                } catch {
                    decrypted.push({
                        id: m.id,
                        direction: "out",
                        plaintext: "⚠️ Decryption failed",
                        timestamp: new Date(m.timestamp).getTime(),
                    });
                }
            } else {
                try {
                    if (!m.nonce || !m.ciphertext) throw new Error("Missing nonce or ciphertext");
                    const text = await decryptMessage(sharedKey, m.nonce, m.ciphertext);
                    decrypted.push({
                        id: m.id,
                        direction: "in",
                        plaintext: text,
                        timestamp: new Date(m.timestamp).getTime(),
                        sender: m.sender,
                    });
                } catch {
                    decrypted.push({
                        id: m.id,
                        direction: "in",
                        plaintext: "⚠️ Decryption failed",
                        timestamp: new Date(m.timestamp).getTime(),
                        sender: m.sender,
                    });
                }
            }
        }

        return decrypted;
    }

    const handleSend = async () => {
        const text = input.trim();
        if (!text) return;

        const now = Date.now();

        // GROUP MODE
        if (activeGroup) {
            const { ensureSenderKey } = await import(
                "../../lib/crypto/sodium"
            );

            let bundle;
            try {
                bundle = await ensureSenderKey(
                    activeGroup.id,
                    identity.publicKey,
                    identity.codename
                );
            } catch (err) {
                console.error(
                    "[client] failed to ensure sender key state for group",
                    err
                );
                return;
            }

            // Broadcast bundle if needed (simplified logic: always try to send to others if not done recently?)
            // In this demo, we rely on the fact that ensureSenderKey returns a bundle if we just rotated or created it.
            // We should send it to everyone.
            if (ws && ws.readyState === WebSocket.OPEN) {
                const recipients = activeGroup.memberPublicKeys.filter(
                    (pk) => pk !== identity.publicKey
                );

                for (const recipientPk of recipients) {
                    deriveSessionKey(identity.secretKey, recipientPk)
                        .then(({ key: sharedKey }) => {
                            return encryptMessage(sharedKey, JSON.stringify(bundle));
                        })
                        .then(({ ciphertext, nonce }) => {
                            ws!.send(
                                JSON.stringify({
                                    type: "group-sender-key-bundle",
                                    from: identity.publicKey,
                                    to: recipientPk,
                                    ciphertext,
                                    nonce,
                                })
                            );
                        })
                        .catch((err) => {
                            console.warn(
                                "[client] failed to send secure bundle to",
                                recipientPk,
                                err
                            );
                        });
                }
            }

            // Encrypt
            let payload;
            try {
                payload = await encryptGroupMessageAsSender(
                    activeGroup.id,
                    identity.publicKey,
                    text
                );
            } catch (err) {
                console.error(
                    "[client] failed to encrypt group message via sender key",
                    err
                );
                return;
            }

            const { counter, ciphertext, signature } = payload;

            // Persist locally
            const stored = addMessage(
                activeGroup.id,
                "group",
                "out",
                input,
                undefined,
                identity.publicKey
            );

            // Update UI
            const newMessage: DecryptedMessage = {
                id: stored.id,
                direction: "out",
                plaintext: input,
                timestamp: new Date(stored.timestamp).getTime(),
                sender: identity.publicKey,
            };
            setMessages((prev) => [...prev, newMessage]);
            setInput("");

            // Send
            const recipientPks = activeGroup.memberPublicKeys.filter(
                (pk) => pk !== identity.publicKey
            );

            for (const recipientPk of recipientPks) {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(
                        JSON.stringify({
                            type: "message",
                            from: identity.publicKey,
                            to: recipientPk,
                            ciphertext,
                            nonce: null,
                            timestamp: now,
                            groupId: activeGroup.id,
                            counter,
                            signature,
                        })
                    );
                }
            }

            updateIdentityLastActive(identity.id);
            return;
        }

        // DIRECT MESSAGE MODE
        if (!activeContact || !activeContact.sharedKey) return;
        setInput("");

        const encrypted = await encryptMessage(activeContact.sharedKey, text);

        addMessage(
            activeContact.id,
            "direct",
            "out",
            encrypted.ciphertext,
            encrypted.nonce
        );

        setMessages((prev) => [
            ...prev,
            {
                id: crypto.randomUUID(),
                direction: "out",
                plaintext: text,
                timestamp: Date.now(),
            },
        ]);

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(
                JSON.stringify({
                    type: "message",
                    from: identity.publicKey,
                    to: activeContact.publicKey,
                    ciphertext: encrypted.ciphertext,
                    nonce: encrypted.nonce,
                    timestamp: now,
                })
            );
        }

        updateIdentityLastActive(identity.id);
    };


    // --- Render ---

    const contactBundle = `e2ee-contact:v1:${JSON.stringify({
        publicKey: identity.publicKey,
        codename: identity.codename,
    })}`;

    // Group messages by sender for UI
    const groupedMessages: {
        sender: string;
        senderCodename: string;
        isContact: boolean;
        messages: DecryptedMessage[];
        direction: "in" | "out";
    }[] = [];

    let currentGroup: (typeof groupedMessages)[0] | null = null;

    messages.forEach((msg) => {
        const senderKey = msg.sender || identity.publicKey;
        const isMe = senderKey === identity.publicKey;
        const dir = isMe ? "out" : "in";

        // Resolve name
        let name = "Unknown";
        let isContact = false;

        if (isMe) {
            name = "You";
        } else {
            const c = contacts.find((c) => c.publicKey === senderKey);
            if (c) {
                name = c.codename;
                isContact = true;
            } else {
                if (strangerCodenames[senderKey]) {
                    name = strangerCodenames[senderKey];
                } else {
                    name = `Member-${senderKey.slice(0, 6)}`;
                }
            }
        }

        if (
            currentGroup &&
            currentGroup.sender === senderKey &&
            currentGroup.direction === dir
        ) {
            currentGroup.messages.push(msg);
        } else {
            currentGroup = {
                sender: senderKey,
                senderCodename: name,
                isContact,
                messages: [msg],
                direction: dir,
            };
            groupedMessages.push(currentGroup);
        }
    });

    return (
        <div className="flex h-screen bg-black text-white font-mono">
            {/* Sidebar */}
            <div
                className={`fixed md:relative z-40 md:z-auto h-full border-r border-neutral-700 bg-neutral-900 transition-all duration-300 overflow-hidden flex flex-col ${sidebarOpen ? "w-80" : "w-0 md:w-80"
                    }`}
            >
                <div className="flex flex-col h-full">
                    <div className="flex-shrink-0 border-b border-neutral-700 p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="h-2 w-2 animate-pulse rounded-full bg-orange-500" />
                                <h1 className="text-xs font-bold tracking-widest text-orange-500 uppercase">
                                    CHANNELS
                                </h1>
                            </div>
                            <button
                                onClick={() => setSidebarOpen(false)}
                                className="md:hidden text-neutral-400 hover:text-orange-500 transition-colors p-1 relative z-50"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    <div className="flex-shrink-0 flex border-b border-neutral-700 bg-neutral-800/30">
                        <button
                            onClick={() => setViewMode("contacts")}
                            className={`flex-1 px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${viewMode === "contacts"
                                ? "border-orange-500 text-orange-400"
                                : "border-transparent text-neutral-400 hover:text-neutral-300"
                                }`}
                        >
                            DIRECT
                        </button>
                        <button
                            onClick={() => setViewMode("groups")}
                            className={`flex-1 px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${viewMode === "groups"
                                ? "border-orange-500 text-orange-400"
                                : "border-transparent text-neutral-400 hover:text-neutral-300"
                                }`}
                        >
                            GROUPS
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto min-w-0">
                        {viewMode === "contacts" && (
                            <CollapsibleSection title="Contacts" defaultOpen>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-neutral-500 font-bold uppercase tracking-wider">
                                            Total
                                        </span>
                                        <span className="text-xs text-orange-400 font-bold bg-orange-500/20 px-2 py-1 rounded">
                                            {contacts.length}
                                        </span>
                                    </div>
                                    <div className="space-y-2">
                                        {contacts.length === 0 && (
                                            <p className="text-xs text-neutral-500">No contacts yet.</p>
                                        )}
                                        {contacts.map((c) => (
                                            <button
                                                key={c.id}
                                                onClick={() => {
                                                    setActiveContactId(c.id);
                                                    setActiveGroupId(null);
                                                    setSidebarOpen(false);
                                                }}
                                                className={`w-full text-left p-3 rounded border transition-all text-sm relative ${activeContactId === c.id && viewMode === "contacts"
                                                    ? "border-orange-400 bg-orange-500/20"
                                                    : "border-neutral-700 hover:border-neutral-600 hover:bg-neutral-800/50"
                                                    }`}
                                            >
                                                <div className="font-bold text-white truncate">
                                                    {c.codename}
                                                </div>
                                                <div className="truncate text-neutral-500 text-xs mt-1">
                                                    {c.publicKey.slice(0, 16)}…
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                    <button
                                        onClick={() => setShowAddContact(true)}
                                        className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-bold text-neutral-300 hover:border-orange-500 hover:text-orange-400 transition-colors uppercase tracking-wider"
                                    >
                                        + ADD CONTACT
                                    </button>
                                </div>
                            </CollapsibleSection>
                        )}

                        {viewMode === "groups" && (
                            <CollapsibleSection title="Group Chats" defaultOpen>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-neutral-500 font-bold uppercase tracking-wider">
                                            Total
                                        </span>
                                        <span className="text-xs text-orange-400 font-bold bg-orange-500/20 px-2 py-1 rounded">
                                            {groupChats.length}
                                        </span>
                                    </div>
                                    <div className="space-y-2">
                                        {groupChats.length === 0 && (
                                            <p className="text-xs text-neutral-500">No groups yet.</p>
                                        )}
                                        {groupChats.map((group) => (
                                            <button
                                                key={group.id}
                                                onClick={() => {
                                                    setActiveGroupId(group.id);
                                                    setActiveContactId(null);
                                                    setSidebarOpen(false);
                                                }}
                                                className={`w-full text-left p-3 rounded border transition-all text-sm relative ${activeGroupId === group.id
                                                    ? "border-orange-400 bg-orange-500/20"
                                                    : "border-neutral-700 hover:border-neutral-600 hover:bg-neutral-800/50"
                                                    }`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <div className="h-2 w-2 rounded-full bg-orange-500/60" />
                                                    <div className="font-bold text-white truncate">
                                                        {group.name}
                                                    </div>
                                                </div>
                                                <div className="truncate text-neutral-500 text-xs mt-1">
                                                    {group.memberPublicKeys.length} members
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                    <button
                                        onClick={() => setShowCreateGroup(true)}
                                        className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-bold text-neutral-300 hover:border-orange-500 hover:text-orange-400 transition-colors uppercase tracking-wider"
                                    >
                                        + CREATE GROUP
                                    </button>
                                </div>
                            </CollapsibleSection>
                        )}

                        <CollapsibleSection title="Security" defaultOpen={false}>
                            <div className="space-y-4">
                                <div>
                                    <p className="text-xs text-neutral-400 uppercase tracking-wider mb-2 font-bold">
                                        My Safety Code
                                    </p>
                                    <div className="bg-black rounded p-3 border border-neutral-700">
                                        <p className="text-sm font-mono text-orange-400 break-all font-semibold">
                                            {identityFp ?? "…"}
                                        </p>
                                    </div>
                                </div>
                                <div className="rounded border border-neutral-700 bg-neutral-800 p-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Lock className="h-3 w-3 text-orange-500 flex-shrink-0" />
                                        <span className="text-xs font-bold text-orange-400 uppercase tracking-wider">
                                            E2E ENCRYPTED
                                        </span>
                                    </div>
                                    <p className="text-xs text-neutral-500">
                                        Keys encrypted with your passphrase. Never shared.
                                    </p>
                                </div>
                            </div>
                        </CollapsibleSection>

                        <CollapsibleSection title="Identity" defaultOpen={false}>
                            <div className="space-y-3">
                                <div>
                                    <p className="text-xs text-neutral-400 uppercase tracking-wider mb-2 font-bold">
                                        Codename
                                    </p>
                                    <p className="text-sm font-bold text-orange-400 break-words">
                                        {identity.codename}
                                    </p>
                                </div>
                                <CopyButton text={identity.codename} label="codename" />
                                <button
                                    onClick={() => setShowIdentityDetails(true)}
                                    className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-bold text-neutral-300 hover:border-orange-500 hover:text-orange-400 transition-colors uppercase tracking-wider"
                                >
                                    VIEW FULL PROFILE
                                </button>
                            </div>
                        </CollapsibleSection>
                    </div>

                    <div className="flex-shrink-0 border-t border-neutral-700 p-4 space-y-2">
                        <button
                            onClick={onBackToVault}
                            className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-bold text-neutral-400 hover:border-orange-500 hover:text-orange-500 transition-colors uppercase tracking-wider"
                        >
                            SWITCH IDENTITY
                        </button>
                    </div>
                </div>
            </div>

            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-30 bg-black/50 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Identity details modal */}
            {showIdentityDetails && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
                    <div className="w-full max-w-lg rounded border border-neutral-700 bg-neutral-900 p-6 font-mono shadow-xl max-h-96 overflow-y-auto">
                        <div className="mb-6 flex items-center justify-between pb-4 border-b border-neutral-700">
                            <h2 className="text-sm font-bold text-orange-400 uppercase tracking-widest">
                                IDENTITY PROFILE
                            </h2>
                            <button
                                onClick={() => setShowIdentityDetails(false)}
                                className="text-neutral-400 hover:text-orange-500 transition-colors"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="space-y-5">
                            <div>
                                <p className="text-xs text-neutral-400 uppercase tracking-wider mb-3 font-bold">
                                    Codename
                                </p>
                                <div className="bg-black rounded p-3 border border-neutral-700 mb-2">
                                    <p className="text-base font-bold text-orange-400 break-words">
                                        {identity.codename}
                                    </p>
                                </div>
                                <CopyButton text={identity.codename} label="codename" />
                            </div>

                            <div>
                                <p className="text-xs text-neutral-400 uppercase tracking-wider mb-3 font-bold">
                                    Public Key
                                </p>
                                <div className="bg-black rounded p-3 border border-neutral-700 max-h-20 overflow-y-auto mb-2">
                                    <p className="text-xs font-mono text-neutral-400 break-all leading-relaxed">
                                        {identity.publicKey}
                                    </p>
                                </div>
                                <CopyButton text={identity.publicKey} label="public key" />
                            </div>

                            <div>
                                <p className="text-xs text-neutral-400 uppercase tracking-wider mb-3 font-bold">
                                    Share Identity
                                </p>
                                <div className="bg-black rounded p-3 border border-neutral-700 max-h-24 overflow-y-auto mb-2">
                                    <p className="text-xs font-mono text-neutral-400 break-all leading-relaxed">
                                        {contactBundle}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <CopyButton text={contactBundle} label="contact bundle" />
                                    <button
                                        type="button"
                                        onClick={() => setShowQr((prev) => !prev)}
                                        className="rounded border border-neutral-600 px-3 py-2 text-xs text-neutral-300 hover:border-orange-500 hover:text-orange-400 transition-all hover:bg-orange-500/10 font-semibold uppercase tracking-wide flex-1"
                                    >
                                        {showQr ? "HIDE QR" : "SHOW QR"}
                                    </button>
                                </div>

                                {showQr && (
                                    <div className="flex flex-col items-center gap-2 pt-4 mt-4 border-t border-neutral-700">
                                        <div className="bg-white p-2 rounded">
                                            <QRCode
                                                value={contactBundle}
                                                size={140}
                                                style={{
                                                    height: "auto",
                                                    maxWidth: "100%",
                                                    width: "100%",
                                                }}
                                            />
                                        </div>
                                        <p className="text-xs text-neutral-500 text-center">
                                            Scan to share your identity
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <button
                            onClick={() => setShowIdentityDetails(false)}
                            className="w-full mt-6 rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-bold text-neutral-400 hover:border-orange-500 hover:text-orange-500 transition-colors uppercase tracking-wider"
                        >
                            CLOSE
                        </button>
                    </div>
                </div>
            )}

            {/* Main chat area */}
            <div className="flex-1 flex flex-col bg-black min-w-0 relative">
                <div className="flex-shrink-0 h-16 flex items-center justify-between border-b border-neutral-700 bg-neutral-900 px-4 md:px-6 relative z-20">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="md:hidden text-neutral-400 hover:text-orange-500 transition-colors flex-shrink-0 p-1 relative z-50"
                        >
                            <Menu className="h-5 w-5" />
                        </button>
                        {activeContact ? (
                            <div className="min-w-0">
                                <h2 className="text-base font-bold text-white truncate">
                                    {activeContact.codename}
                                </h2>
                                <p className="text-xs text-neutral-400">
                                    E2EE ·{" "}
                                    <span className="text-orange-400 font-mono font-semibold">
                                        {activeContactFp}
                                    </span>
                                </p>
                            </div>
                        ) : activeGroup ? (
                            <div className="min-w-0">
                                <h2 className="text-base font-bold text-white truncate flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-orange-500" />
                                    {activeGroup.name}
                                </h2>
                                <p className="text-xs text-neutral-400">
                                    E2EE ·{" "}
                                    <span className="text-orange-400 font-mono">
                                        {activeGroup.memberPublicKeys.length} members
                                    </span>
                                </p>
                            </div>
                        ) : (
                            <div className="text-sm text-neutral-500">
                                Select a chat
                            </div>
                        )}
                    </div>

                    {/* Header Actions */}
                    <div className="flex items-center gap-2">
                        {activeGroup && (
                            <button
                                onClick={() => setShowGroupInfo(true)}
                                className="p-2 text-neutral-400 hover:text-orange-500 transition-colors rounded hover:bg-neutral-800"
                                title="Group Info"
                            >
                                <Menu className="h-5 w-5" />
                            </button>
                        )}
                        {activeContact && (
                            <button
                                onClick={() => setShowContactInfo(true)}
                                className="p-2 text-neutral-400 hover:text-orange-500 transition-colors rounded hover:bg-neutral-800"
                                title="Contact Info"
                            >
                                <MoreVertical className="h-5 w-5" />
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
                    {!activeContact && !activeGroup ? (
                        <div className="h-full flex flex-col items-center justify-center text-neutral-500 space-y-4">
                            <div className="h-16 w-16 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-800">
                                <Lock className="h-8 w-8 text-neutral-700" />
                            </div>
                            <p className="text-sm uppercase tracking-widest">
                                Select a contact or group to start chatting
                            </p>
                        </div>
                    ) : (
                        <>
                            {groupedMessages.map((group, i) => (
                                <MessageGroup
                                    key={i}
                                    senderPublicKey={group.sender}
                                    senderCodename={group.senderCodename}
                                    isContact={group.isContact}
                                    messages={group.messages}
                                    direction={group.direction}
                                    onAddContact={(pk) => {
                                        setAddContactPrefill({ publicKey: pk });
                                        setShowAddContact(true);
                                    }}
                                />
                            ))}
                            <div ref={messagesEndRef} />
                        </>
                    )}
                </div>

                {(activeContact || activeGroup) && (
                    <div className="flex-shrink-0 p-4 md:p-6 bg-neutral-900 border-t border-neutral-700 relative z-20">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                                placeholder={`Message ${activeContact ? activeContact.codename : activeGroup?.name
                                    }...`}
                                className="flex-1 bg-black border border-neutral-700 rounded px-4 py-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-orange-500 transition-colors font-mono"
                            />
                            <button
                                onClick={handleSend}
                                disabled={!input.trim()}
                                className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Send className="h-5 w-5" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Modals */}
            {showAddContact && (
                <AddContactModal
                    identity={identity}
                    initialPublicKey={addContactPrefill?.publicKey}
                    onClose={() => {
                        setShowAddContact(false);
                        setAddContactPrefill(null);
                    }}
                    onAdded={() => {
                        setContacts(loadContacts(identity.id));
                        setShowAddContact(false);
                        setAddContactPrefill(null);
                        toast.success("Contact added");
                    }}
                />
            )}

            {showCreateGroup && (
                <CreateGroupModal
                    identity={identity}
                    contacts={contacts}
                    onClose={() => setShowCreateGroup(false)}
                    onCreated={() => {
                        setGroupChats(loadGroups(identity.id));
                        setShowCreateGroup(false);
                        toast.success("Group created");
                    }}
                />
            )}

            {showGroupInfo && activeGroup && (
                <GroupInfoModal
                    group={activeGroup}
                    identity={identity}
                    contacts={contacts}
                    onClose={() => setShowGroupInfo(false)}
                    onLeave={() => {
                        // Broadcast leave event
                        const evt: GroupEvent = {
                            type: "leave",
                            groupId: activeGroup.id,
                            publicKey: identity.publicKey,
                        };

                        // Broadcast to all members
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            activeGroup.memberPublicKeys.forEach((pk) => {
                                if (pk === identity.publicKey) return;
                                ws.send(JSON.stringify({
                                    type: "group-event",
                                    to: pk,
                                    from: identity.publicKey,
                                    event: evt
                                }));
                            });
                        }

                        // Apply locally
                        const updated = applyGroupEvent(identity.id, identity.publicKey, evt);
                        setGroupChats(updated);
                        setActiveGroupId(null);
                        setShowGroupInfo(false);
                        deleteMessagesForGroup(activeGroup.id);
                        toast.success("Left group");
                    }}
                    onKick={(publicKey) => {
                        // Broadcast kick event
                        const evt: GroupEvent = {
                            type: "kick",
                            groupId: activeGroup.id,
                            targetPublicKey: publicKey,
                        };

                        // Broadcast to all members (including target)
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            activeGroup.memberPublicKeys.forEach((pk) => {
                                if (pk === identity.publicKey) return;
                                ws.send(JSON.stringify({
                                    type: "group-event",
                                    to: pk,
                                    from: identity.publicKey,
                                    event: evt
                                }));
                            });
                        }

                        // Apply locally
                        const updated = applyGroupEvent(identity.id, identity.publicKey, evt);
                        setGroupChats(updated);
                        toast.success("Member kicked");
                    }}
                    onAddMember={() => setShowAddMember(true)}
                />
            )}

            {showAddMember && activeGroup && (
                <AddMemberModal
                    group={activeGroup}
                    contacts={contacts}
                    onClose={() => setShowAddMember(false)}
                    onAdd={(publicKey) => {
                        // Broadcast add event
                        const evt: GroupEvent = {
                            type: "add",
                            groupId: activeGroup.id,
                            groupName: activeGroup.name,
                            creatorPublicKey: activeGroup.creatorPublicKey,
                            newMemberPublicKey: publicKey,
                            allMembers: [...activeGroup.memberPublicKeys, publicKey],
                        };

                        // Broadcast to all members (old + new)
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            [...activeGroup.memberPublicKeys, publicKey].forEach((pk) => {
                                if (pk === identity.publicKey) return;
                                ws.send(JSON.stringify({
                                    type: "group-event",
                                    to: pk,
                                    from: identity.publicKey,
                                    event: evt
                                }));
                            });
                        }

                        // Apply locally
                        const updated = applyGroupEvent(identity.id, identity.publicKey, evt);
                        setGroupChats(updated);
                        setShowAddMember(false);
                        toast.success("Member added");
                    }}
                />
            )}

            {showContactInfo && activeContact && (
                <ContactInfoModal
                    contact={activeContact}
                    onClose={() => setShowContactInfo(false)}
                    onClearHistory={() => {
                        deleteMessagesForContacts([activeContact.id]);
                        setMessages([]);
                        toast.success("Chat history cleared");
                        setShowContactInfo(false);
                    }}
                    onDelete={() => {
                        deleteContact(identity.id, activeContact.id);
                        deleteMessagesForContacts([activeContact.id]);
                        setContacts(loadContacts(identity.id));
                        setActiveContactId(null);
                        toast.success("Contact deleted");
                        setShowContactInfo(false);
                    }}
                />
            )}
        </div>
    );
}
