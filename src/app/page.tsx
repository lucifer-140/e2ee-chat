"use client";

import { useState, useEffect } from "react";
import {
  loadIdentities,
  StoredIdentity,
  UnlockedIdentity,
  deleteIdentity,
} from "@/lib/identities/store";

import { ToastProvider } from "@/components/ui/ToastProvider";
import { IdentityCreateScreen } from "@/components/identity/IdentityCreateScreen";
import { UnlockIdentityScreen } from "@/components/identity/UnlockIdentityScreen";
import { IdentityVault } from "@/components/identity/IdentityVault";
import { ChatShell } from "@/components/chat/ChatShell";

type Mode = "vault" | "create-identity" | "unlock-identity" | "chat";

export default function Page() {
  const [mode, setMode] = useState<Mode>("vault");
  const [identities, setIdentities] = useState<StoredIdentity[]>([]);
  const [selectedIdentity, setSelectedIdentity] = useState<StoredIdentity | null>(
    null
  );
  const [activeIdentity, setActiveIdentity] = useState<UnlockedIdentity | null>(
    null
  );

  // Load identities on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setIdentities(loadIdentities());
  }, []);

  const refreshIdentities = () => {
    setIdentities(loadIdentities());
  };

  // --- Handlers ---

  const handleCreateIdentity = (newId: UnlockedIdentity) => {
    setActiveIdentity(newId);
    setMode("chat");
    refreshIdentities();
  };

  const handleUnlockSuccess = (unlocked: UnlockedIdentity) => {
    setActiveIdentity(unlocked);
    setMode("chat");
  };

  const handleDeleteIdentity = (id: StoredIdentity) => {
    if (confirm(`Delete identity "${id.codename}"? This cannot be undone.`)) {
      deleteIdentity(id.id);
      refreshIdentities();
    }
  };

  // --- Render ---

  return (
    <ToastProvider>
      {mode === "vault" && (
        <IdentityVault
          identities={identities}
          onActivate={(id) => {
            setSelectedIdentity(id);
            setMode("unlock-identity");
          }}
          onCreateNew={() => setMode("create-identity")}
          onDelete={handleDeleteIdentity}
        />
      )}

      {mode === "create-identity" && (
        <IdentityCreateScreen
          onCreated={handleCreateIdentity}
          onBackToVaultIfAny={() => setMode("vault")}
          hasExisting={identities.length > 0}
        />
      )}

      {mode === "unlock-identity" && selectedIdentity && (
        <UnlockIdentityScreen
          identity={selectedIdentity}
          onUnlocked={handleUnlockSuccess}
          onCancel={() => {
            setSelectedIdentity(null);
            setMode("vault");
          }}
        />
      )}

      {mode === "chat" && activeIdentity && (
        <ChatShell
          identity={activeIdentity}
          onBackToVault={() => {
            setActiveIdentity(null);
            setSelectedIdentity(null);
            setMode("vault");
            refreshIdentities();
          }}
        />
      )}
    </ToastProvider>
  );
}
