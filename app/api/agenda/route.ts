import { NextResponse } from "next/server";

export async function GET() {
  try {
    const SCRIPT_URL = process.env.GS_SCRIPT_URL;
    if (!SCRIPT_URL) {
      return NextResponse.json({ error: "Missing GS_SCRIPT_URL" }, { status: 500 });
    }

    const url = `${SCRIPT_URL}?action=agenda&t=${Date.now()}`;

    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();

    if (!res.ok) {
      return NextResponse.json(
        { error: `AppsScript HTTP ${res.status}`, details: text },
        { status: 500 }
      );
    }

    return NextResponse.json(JSON.parse(text));
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}