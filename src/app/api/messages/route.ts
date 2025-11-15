// src/app/api/messages/route.ts
import { NextResponse } from "next/server";

// In-memory store (server only)
interface RelayMessage {
  id: string;
  from: string;     // sender public key
  to: string;       // receiver public key
  ciphertext: string;
  nonce: string;
  timestamp: string;
}

const messages: RelayMessage[] = [];

// ----------- POST: Send encrypted message -----------
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { from, to, ciphertext, nonce, timestamp } = body;

    if (!from || !to || !ciphertext || !nonce || !timestamp) {
      return NextResponse.json(
        { error: "Missing fields" },
        { status: 400 }
      );
    }

    const msg: RelayMessage = {
      id: crypto.randomUUID(),
      from,
      to,
      ciphertext,
      nonce,
      timestamp,
    };

    messages.push(msg);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/messages error:", err);
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }
}

// ----------- GET: Fetch messages for a recipient -----------
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get("for");

  if (!target) {
    return NextResponse.json(
      { error: "Missing 'for' query param" },
      { status: 400 }
    );
  }

  const incoming = messages.filter((m) => m.to === target);

  // Remove delivered messages
  for (const m of incoming) {
    const idx = messages.findIndex((x) => x.id === m.id);
    if (idx !== -1) messages.splice(idx, 1);
  }

  return NextResponse.json({ messages: incoming });
}
