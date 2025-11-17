// src/lib/groups/store.ts
import { safeRandomId } from "@/lib/utils/id";

export interface GroupChat {
  id: string;
  identityId: string;
  name: string;
  memberPublicKeys: string[];
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

export type GroupEvent = {
  type: "create";
  groupId: string;
  name: string;
  members: string[];
};

export function applyGroupEvent(
  identityId: string,
  myPublicKey: string,
  event: GroupEvent
): GroupChat[] {
  // Only care if I'm actually a member
  if (!event.members.includes(myPublicKey)) {
    return loadGroups(identityId);
  }

  const now = new Date().toISOString();
  const existing = loadGroups(identityId);
  const idx = existing.findIndex((g) => g.id === event.groupId);

  if (idx >= 0) {
    const updated: GroupChat = {
      ...existing[idx],
      name: event.name,
      memberPublicKeys: event.members,
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
    createdAt: now,
    updatedAt: now,
  };

  const next = [...existing, group];
  saveGroups(identityId, next);
  return next;
}
