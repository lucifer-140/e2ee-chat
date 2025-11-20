// src/lib/utils/id.ts
"use client";

export function safeRandomId(): string {
  try {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto !== "undefined" &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      typeof (crypto as any).randomUUID === "function"
    ) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (crypto as any).randomUUID();
    }
  } catch {
    // ignore
  }

  // Fallback: pseudo-random ID (good enough for UI)
  const rand = Math.random().toString(36).slice(2);
  const time = Date.now().toString(36);
  return `id-${time}-${rand}`;
}
