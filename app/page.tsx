"use client";

import Splash from "../components/Splash";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Row = {
  "Container ID": string;
  "Nombre contenedor": string;
  "Ubicación": string;
  "Zona": string;
  "Próximo riego": string | number;
  "Estado contenedor": string;
};

// ✅ evita requests duplicadas/race conditions
let inFlight: AbortController | null = null;

function parseDateFlexible(s: string | number): Date | null {
  const v = (s ?? "").toString().trim();
  if (!v) return null;

  // 1) ISO
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  // 2) yyyy-mm-dd
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

  // 4) serial de Sheets
  if (/^\d+(\.\d+)?$/.test(v)) {
    const serial = Number(v);
    const base = new Date(Date.UTC(1899, 11, 30));
    const ms = serial * 24 * 60 * 60 * 1000;
    return new Date(base.getTime() + ms);
  }

  return null;
}

function daysDiff(a: Date, b: Date) {
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

  // Splash control
  const [initialLoading, setInitialLoading] = useState(true);
  const splashStart = useRef(Date.now());
  const splashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ✅ evita doble load del useEffect en dev
  const didMount = useRef(false);

  const load = useCallback(async () => {
    // cancela request anterior si aún no termina
    if (inFlight) inFlight.abort();
    const ac = new AbortController();
    inFlight = ac;

    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/agenda?t=${Date.now()}`, {
        cache: "no-store",
        signal: ac.signal,
      });

      const text = await res.text();
      if (!res.ok) throw new Error(text);

      const json = JSON.parse(text) as { rows: Row[] };
      const nextRows = Array.isArray(json.rows) ? json.rows : [];

      // 🛡️ Si llega vacío por timing/caché, no pises datos ya mostrados
      if (nextRows.length === 0 && rows.length > 0) return;

      setRows(nextRows);
    } catch (e: any) {
      if (e?.name === "AbortError") return; // normal al cancelar
      setError(e?.message ?? "Error cargando datos");
    } finally {
      if (inFlight === ac) inFlight = null;
      setLoading(false);

      // ⏳ Splash mínimo 6s desde que inició
      const elapsed = Date.now() - splashStart.current;
      const minDuration = 4000;
      const remaining = Math.max(minDuration - elapsed, 0);

      if (splashTimer.current) clearTimeout(splashTimer.current);
      splashTimer.current = setTimeout(() => {
        setInitialLoading(false);
      }, remaining);
    }
  }, [rows.length]);

  useEffect(() => {
    if (didMount.current) return;
    didMount.current = true;
    load();

    return () => {
      if (splashTimer.current) clearTimeout(splashTimer.current);
      if (inFlight) inFlight.abort();
    };
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
    if (s.includes("rojo")) return "bg-red-500 text-white";
    if (s.includes("amarillo")) return "bg-yellow-400 text-black";
    return "bg-green-500 text-white";
  }

  function urgencyText(diff: number) {
    if (diff < 0) return "Necesita agua";
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
    <>
      <Splash visible={initialLoading} />

      <main className="min-h-screen bg-gradient-to-b from-amber-50 via-lime-50 to-emerald-50 p-6 text-stone-700">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold text-emerald-700">
                DANU · Agenda de riego
              </h1>
              <p className="mt-2 text-stone-600">
                Lo que necesita cuidado hoy y en los próximos días.
              </p>
            </div>

            <button
              onClick={load}
              className="rounded-xl bg-white shadow-sm border border-emerald-200 px-3 py-2 text-sm hover:bg-emerald-50 transition disabled:opacity-60"
              disabled={loading}
            >
              {loading ? "Actualizando…" : "↻ Actualizar"}
            </button>
          </div>

          {error && (
            <div className="mt-4 p-4 rounded-xl bg-red-100 border border-red-300 text-red-700">
              {error}
            </div>
          )}

          <div className="mt-6 grid gap-4">
            {!error && agenda.length === 0 && !loading && (
              <div className="p-4 rounded-xl bg-white shadow-sm border border-emerald-100">
                🌿 Hoy las plantas descansan
              </div>
            )}

            {agenda.map((r: any) => (
              <div
                key={r["Container ID"]}
                className="p-5 rounded-2xl bg-white shadow-sm border border-emerald-100"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xl font-semibold text-emerald-700">
                      {r["Nombre contenedor"] || r["Container ID"]}
                    </div>
                    <div className="mt-1 text-stone-500">
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

                <div className="mt-4 grid gap-2">
                  <div className="flex items-center justify-between">
                    <div>
                      Próximo riego:{" "}
                      <span className="font-semibold">
                        {formatDate(r["Próximo riego"])}
                      </span>
                    </div>
                    <div className="text-stone-500">{urgencyText(r._diff)}</div>
                  </div>

                  <button
                    onClick={() => marcarRegado(r["Container ID"])}
                    disabled={markingId === r["Container ID"]}
                    className="w-full rounded-xl bg-emerald-500 py-2 font-semibold text-white hover:bg-emerald-600 transition disabled:opacity-60"
                  >
                    {markingId === r["Container ID"]
                      ? "Cuidando…"
                      : "💧 Ya recibió agua"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <footer className="mt-10 text-sm text-stone-500">
            DANU · Tecnología que germina
          </footer>
        </div>
      </main>
    </>
  );
}