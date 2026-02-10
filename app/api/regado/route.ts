import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { containerId } = await req.json();

    if (!containerId) {
      return NextResponse.json({ error: "Missing containerId" }, { status: 400 });
    }

    const SCRIPT_URL = process.env.GS_SCRIPT_URL;
    if (!SCRIPT_URL) {
      return NextResponse.json({ error: "Missing GS_SCRIPT_URL" }, { status: 500 });
    }

    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      // IMPORTANTE: text/plain reduce broncas con Apps Script
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ containerId }),
      cache: "no-store",
    });

    const text = await res.text();

    if (!res.ok) {
      return NextResponse.json(
        { error: `AppsScript HTTP ${res.status}`, details: text },
        { status: 500 }
      );
    }

    // si Apps Script devuelve JSON, lo regresamos
    try {
      return NextResponse.json(JSON.parse(text));
    } catch {
      return NextResponse.json({ success: true, raw: text });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}