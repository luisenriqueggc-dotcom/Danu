"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Papa from "papaparse";

type Row = {
  "Container ID": string;
  "Nombre contenedor": string;
  "Ubicación": string;
  "Zona": string;
  "Próximo riego": string;
  "Estado contenedor": string;
};

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRiJMWPL5vUJGS7p5uy-CyOW2pasM5JgAknprxbM0tf_GGtxaUfUca8HFNsridfaNyTsO3YKEfrTXkF/pub?gid=466265064&single=true&output=csv";

function normalizeHeader(h: string) {
  return h.trim();
}

// ✅ Soporta "dd/mm/yyyy" y serial de Sheets (ej. 46065)
function parseDateFlexible(s: string): Date | null {
  const v = (s ?? "").toString().trim();
  if (!v) return null;

  // Caso 1: dd/mm/yyyy
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    return new Date(yyyy, mm - 1, dd);
  }

  // Caso 2: serial numérico (Google Sheets)
  if (/^\d+(\.\d+)?$/.test(v)) {
    const serial = Number(v);
    // Base de Google Sheets: 1899-12-30
    const base = new Date(Date.UTC(1899, 11, 30));
    const ms = serial * 24 * 60 * 60 * 1000;
    return new Date(base.getTime() + ms);
  }

  return null;
}

function daysDiff(a: Date, b: Date) {
  const ms = 24 * 60 * 60 * 1000;
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / ms);
}

export default function Page() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setRows([]); // ✅ evita mostrar datos viejos mientras carga

      // cache-buster
      const url = `${CSV_URL}&t=${Date.now()}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Error HTTP ${res.status}`);

      const text = await res.text();

      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: normalizeHeader,
      });

      const data = (parsed.data || [])
        .map((r) => ({
          "Container ID": r["Container ID"] ?? "",
          "Nombre contenedor": r["Nombre contenedor"] ?? "",
          "Ubicación": r["Ubicación"] ?? "",
          "Zona": r["Zona"] ?? "",
          "Próximo riego": r["Próximo riego"] ?? "",
          "Estado contenedor": r["Estado contenedor"] ?? "",
        }))
        .filter((r) => r["Container ID"]);

      setRows(data);
    } catch (e: any) {
      setError(e?.message ?? "Error cargando datos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const today = new Date();

  const agenda = useMemo(() => {
    return rows
      .map((r) => {
        const d = parseDateFlexible(r["Próximo riego"]);
        const diff = d ? daysDiff(today, d) : 9999;
        return { ...r, _diff: diff };
      })
      // seguridad: solo hoy + 2 días
      .filter((r: any) => r._diff <= 2)
      .sort((a: any, b: any) => a._diff - b._diff);
  }, [rows, today]);

  function badge(state: string) {
    const s = (state || "").toLowerCase();
    if (s.includes("rojo")) return "bg-red-600 text-white";
    if (s.includes("amarillo")) return "bg-yellow-400 text-black";
    return "bg-green-600 text-white";
  }

  function urgencyText(diff: number) {
    if (diff < 0) return "Atrasado";
    if (diff === 0) return "Hoy";
    if (diff === 1) return "Mañana";
    if (diff === 2) return "En 2 días";
    return `En ${diff} días`;
  }

  async function marcarRegado(containerId: string) {
    try {
      setMarkingId(containerId);

      const res = await fetch("/api/regado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ containerId }),
        cache: "no-store",
      });

      const text = await res.text();
      if (!res.ok) throw new Error(text);

      // ✅ dale un momento a Google Sheets/CSV para reflejar cambios
      await new Promise((r) => setTimeout(r, 600));

      // Recarga suave (sin reload)
      await load();
    } catch (err: any) {
      console.error(err);
      alert(`Error al marcar como regado:\n${err?.message ?? err}`);
    } finally {
      setMarkingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50 p-5">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold">DANU · Agenda de riego</h1>
            <p className="text-neutral-300 mt-2">
              Lo que toca regar hoy y en los próximos 2 días.
            </p>
          </div>

          <button
            onClick={load}
            className="rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800 transition disabled:opacity-60"
            disabled={loading}
            title="Actualizar"
          >
            {loading ? "Actualizando…" : "↻ Actualizar"}
          </button>
        </div>

        {error && (
          <div className="mt-4 p-4 rounded-xl bg-red-900/40 border border-red-700">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-3">
          {loading && (
            <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-300">
              Actualizando agenda…
            </div>
          )}

          {!error && agenda.length === 0 && !loading && (
            <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800">
              Todo en orden ✨ No hay riegos urgentes.
            </div>
          )}

          {!loading &&
            agenda.map((r: any) => (
              <div
                key={r["Container ID"]}
                className="p-4 rounded-2xl bg-neutral-900 border border-neutral-800"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xl font-semibold">
                      {r["Nombre contenedor"] || r["Container ID"]}
                    </div>
                    <div className="text-neutral-300 mt-1">
                      {r["Ubicación"]} · {r["Zona"]}
                    </div>
                  </div>

                  <span
                    className={`px-3 py-1 rounded-full text-sm font-semibold ${badge(
                      r["Estado contenedor"]
                    )}`}
                  >
                    {r["Estado contenedor"] || "—"}
                  </span>
                </div>

                <div className="mt-3 grid gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-neutral-200">
                      Próximo riego:{" "}
                      <span className="font-semibold">{r["Próximo riego"]}</span>
                    </div>
                    <div className="text-neutral-400">{urgencyText(r._diff)}</div>
                  </div>

                  <button
                    onClick={() => marcarRegado(r["Container ID"])}
                    disabled={markingId === r["Container ID"]}
                    className="w-full rounded-xl bg-green-600 py-2 font-semibold text-white hover:bg-green-700 transition disabled:opacity-60 disabled:hover:bg-green-600"
                  >
                    {markingId === r["Container ID"] ? "Marcando…" : "💧 Regado"}
                  </button>
                </div>
              </div>
            ))}
        </div>

        <footer className="mt-10 text-sm text-neutral-500">
          DANU MVP · Datos desde Google Sheets
        </footer>
      </div>
    </main>
  );
}