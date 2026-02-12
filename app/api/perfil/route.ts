import { NextResponse } from "next/server";

export async function GET() {
  try {
    const base = process.env.GS_SCRIPT_URL;
    if (!base) {
      return NextResponse.json(
        { error: "Falta GS_SCRIPT_URL en variables de entorno" },
        { status: 500 }
      );
    }

    const url = `${base}?action=perfil&t=${Date.now()}`;

    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        // Ayuda a evitar caché intermedio
        "Cache-Control": "no-store",
      },
    });

    const text = await res.text();
    if (!res.ok) return new NextResponse(text, { status: res.status });

    // Apps Script ya regresa JSON
    const json = JSON.parse(text);
    return NextResponse.json(json, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Error en /api/perfil" },
      { status: 500 }
    );
  }
}