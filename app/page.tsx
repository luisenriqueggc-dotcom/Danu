"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Row = {
  "Container ID": string;
  "Nombre contenedor": string;
  "Ubicación": string;
  "Zona": string;
  "Próximo riego": string | number;
  "Estado contenedor": string;
};

function parseDateFlexible(s: string | number): Date | null {
  const v = (s ?? "").toString().trim();
  if (!v) return null;

  // 1) ISO: 2026-02-11T06:00:00.000Z (o similar)
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  // 2) yyyy-mm-dd (por si acaso)
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(v + "T00:00:00");
    return isNaN(d.getTime()) ? null : d;
  }

  // 3) dd/mm/yyyy
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    return new Date(yyyy, mm - 1, dd);
  }

  // 4) serial de Sheets (ej. 46065)
  if (/^\d+(\.\d+)?$/.test(v)) {
    const serial = Number(v);
    const base = new Date(Date.UTC(1899, 11, 30));
    const ms = serial * 24 * 60 * 60 * 1000;
    return new Date(base.getTime() + ms);
  }

  return null;
}

function daysDiff(a: Date, b: Date) {
  // Comparación por día (UTC) para evitar broncas de horario
  const ms = 24 * 60 * 60 * 1000;
  const utcA = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const utcB = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((utcB - utcA) / ms);
}

export default function Page() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (loading) return;
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/agenda?t=${Date.now()}`, { cache: "no-store" });
      const text = await res.text();
      if (!res.ok) throw new Error(text);

      const json = JSON.parse(text) as { rows: Row[] };
      setRows(Array.isArray(json.rows) ? json.rows : []);
    } catch (e: any) {
      setError(e?.message ?? "Error cargando datos");
    } finally {
      setLoading(false);
    }
  }, [loading]);

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

  function formatDate(d: string | number) {
    const parsed = parseDateFlexible(d);
    if (!parsed) return String(d ?? "");
    return parsed.toLocaleDateString("es-MX");
  }

  async function marcarRegado(containerId: string) {
    try {
      setMarkingId(containerId);

      // Optimistic UI: lo quita al instante
      setRows((prev) => prev.filter((r) => r["Container ID"] !== containerId));

      const res = await fetch("/api/regado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ containerId }),
        cache: "no-store",
      });

      const text = await res.text();
      if (!res.ok) throw new Error(text);

      // espera breve para que Sheets actualice
      await new Promise((r) => setTimeout(r, 500));

      await load();
    } catch (err: any) {
      console.error(err);
      alert(`Error al marcar como regado:\n${err?.message ?? err}`);
      await load();
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
                      <span className="font-semibold">
                        {formatDate(r["Próximo riego"])}
                      </span>
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