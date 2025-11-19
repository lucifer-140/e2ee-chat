// src/lib/groups/store.ts
import { safeRandomId } from "@/lib/utils/id";

export interface GroupChat {
  id: string;
  identityId: string;
  name: string;
  memberPublicKeys: string[];
  creatorPublicKey: string; // 🔸 NEW
  createdAt: string;
  updatedAt: string;
}

const STORAGE_PREFIX = "groups:";

function storageKey(identityId: string) {
  return `${STORAGE_PREFIX}${identityId}`;
}

export function loadGroups(identityId: string): GroupChat[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(identityId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as GroupChat[];
  } catch (err) {
    console.warn("[groups/store] Failed to load groups", err);
    return [];
  }
}

function saveGroups(identityId: string, groups: GroupChat[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(identityId), JSON.stringify(groups));
  } catch (err) {
    console.warn("[groups/store] Failed to save groups", err);
  }
}

export function createGroup(
  identityId: string,
  name: string,
  memberPublicKeys: string[],
  opts?: { id?: string }
): GroupChat {
  const now = new Date().toISOString();
  const group: GroupChat = {
    id: opts?.id ?? safeRandomId(),
    identityId,
    name,
    memberPublicKeys,
    creatorPublicKey: memberPublicKeys[0], // assume first is creator
    createdAt: now,
    updatedAt: now,
  };

  const existing = loadGroups(identityId);
  const idx = existing.findIndex((g) => g.id === group.id);
  let next: GroupChat[];
  if (idx >= 0) {
    next = [...existing];
    next[idx] = group;
  } else {
    next = [...existing, group];
  }

  saveGroups(identityId, next);
  return group;
}

export function deleteGroup(identityId: string, groupId: string): void {
  const existing = loadGroups(identityId);
  const next = existing.filter((g) => g.id !== groupId);
  saveGroups(identityId, next);
}

export type GroupEvent =
  | {
    type: "create";
    groupId: string;
    name: string;
    members: string[];
    creatorPublicKey: string;
  }
  | {
    type: "leave";
    groupId: string;
    publicKey: string;
  }
  | {
    type: "kick";
    groupId: string;
    targetPublicKey: string;
  };

export function applyGroupEvent(
  identityId: string,
  myPublicKey: string,
  event: GroupEvent
): GroupChat[] {
  // For create/update, only care if I'm a member
  if (event.type === "create" && !event.members.includes(myPublicKey)) {
    return loadGroups(identityId);
  }

  const now = new Date().toISOString();
  const existing = loadGroups(identityId);
  const idx = existing.findIndex((g) => g.id === event.groupId);

  // Handle LEAVE
  if (event.type === "leave") {
    if (idx === -1) return existing;
    const group = existing[idx];
    // If I left, remove group entirely
    if (event.publicKey === myPublicKey) {
      const next = existing.filter((g) => g.id !== event.groupId);
      saveGroups(identityId, next);
      return next;
    }
    // Else remove them from members
    const nextMembers = group.memberPublicKeys.filter((k) => k !== event.publicKey);
    const updated: GroupChat = {
      ...group,
      memberPublicKeys: nextMembers,
      updatedAt: now,
    };
    const next = [...existing];
    next[idx] = updated;
    saveGroups(identityId, next);
    return next;
  }

  // Handle KICK
  if (event.type === "kick") {
    if (idx === -1) return existing;
    const group = existing[idx];
    // If I was kicked, remove group
    if (event.targetPublicKey === myPublicKey) {
      const next = existing.filter((g) => g.id !== event.groupId);
      saveGroups(identityId, next);
      return next;
    }
    // Else remove target
    const nextMembers = group.memberPublicKeys.filter((k) => k !== event.targetPublicKey);
    const updated: GroupChat = {
      ...group,
      memberPublicKeys: nextMembers,
      updatedAt: now,
    };
    const next = [...existing];
    next[idx] = updated;
    saveGroups(identityId, next);
    return next;
  }

  // Handle CREATE / UPDATE
  if (event.type === "create") {
    if (idx >= 0) {
      const updated: GroupChat = {
        ...existing[idx],
        name: event.name,
        memberPublicKeys: event.members,
        creatorPublicKey: event.creatorPublicKey,
        updatedAt: now,
      };
      const next = [...existing];
      next[idx] = updated;
      saveGroups(identityId, next);
      return next;
    }

    const group: GroupChat = {
      id: event.groupId,
      identityId,
      name: event.name,
      memberPublicKeys: event.members,
      creatorPublicKey: event.creatorPublicKey,
      createdAt: now,
      updatedAt: now,
    };

    const next = [...existing, group];
    saveGroups(identityId, next);
    return next;
  }

  return existing;
}
