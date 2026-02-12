"use client";

import { useMemo } from "react";

type Bee = {
  id: number;
  size: number; // px
  top: number; // %
  delay: number; // s
  duration: number; // s
  opacity: number; // 0-1
  blur: number; // px
  drift: number; // px (curvita vertical)
  floatAmp: number; // px (flotar)
  floatDur: number; // s
  wiggleDur: number; // s
  direction: "lr" | "rl";
  lane: number; // 0..1 (profundidad)
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// RNG determinístico (mulberry32) para que las abejas no cambien cada render
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rand(rng: () => number, min: number, max: number) {
  return rng() * (max - min) + min;
}

/**
 * BeeSwarm: abejas sutiles entre el fondo y el contenido
 * - safeTop/safeBottom: evita que crucen por encima de tus cards/botones
 * - seed: para estabilidad visual
 */
export default function BeeSwarm({
  count = 9,
  enabled = true,
  seed = 4242,
  safeTop = 22,
  safeBottom = 86,
  avoidMiddle = true,
  middleFrom = 32,
  middleTo = 78,
  maxOpacity = 0.55,
}: {
  count?: number;
  enabled?: boolean;
  seed?: number;
  safeTop?: number; // %
  safeBottom?: number; // %
  avoidMiddle?: boolean;
  middleFrom?: number; // %
  middleTo?: number; // %
  maxOpacity?: number;
}) {
  const bees = useMemo<Bee[]>(() => {
    if (!enabled) return [];

    const rng = mulberry32(seed);

    const pickTop = () => {
      // Si evitamos el centro (cards), elegimos de dos bandas: arriba o abajo
      if (!avoidMiddle) return rand(rng, safeTop, safeBottom);

      const topBandStart = safeTop;
      const topBandEnd = clamp(middleFrom - 2, safeTop, safeBottom);

      const bottomBandStart = clamp(middleTo + 2, safeTop, safeBottom);
      const bottomBandEnd = safeBottom;

      // Si por alguna razón las bandas se solapan, fallback simple
      if (topBandEnd <= topBandStart || bottomBandEnd <= bottomBandStart) {
        return rand(rng, safeTop, safeBottom);
      }

      const chooseTopBand = rng() > 0.45; // un poquito más de abejas arriba
      return chooseTopBand
        ? rand(rng, topBandStart, topBandEnd)
        : rand(rng, bottomBandStart, bottomBandEnd);
    };

    return Array.from({ length: count }).map((_, i) => {
      const direction: Bee["direction"] = rng() > 0.5 ? "lr" : "rl";

      // lane = "profundidad": 0 lejos, 1 cerca
      const lane = rand(rng, 0.15, 1);

      const size = Math.round(rand(rng, 14, 44) * (0.75 + lane * 0.5));
      const opacity = clamp(rand(rng, 0.16, maxOpacity) * (0.55 + lane * 0.7), 0.12, maxOpacity);

      // Más blur si está "lejos"
      const blur = lane < 0.35 ? rand(rng, 0.8, 2.2) : rng() > 0.9 ? rand(rng, 0.6, 1.4) : 0;

      const top = Math.round(pickTop());

      // Movimiento: más lento si “lejos”
      const duration = Number(rand(rng, 22, 44) * (1.15 - lane * 0.35)).toFixed(2);
      const delay = Number(rand(rng, 0, 10)).toFixed(2);

      // “Curva” vertical suave mientras cruzan
      const drift = rand(rng, 18, 64) * (0.6 + lane * 0.6);

      // Flotar + wiggle
      const floatAmp = rand(rng, 6, 16) * (0.7 + lane * 0.6);
      const floatDur = rand(rng, 3.2, 6.8);
      const wiggleDur = rand(rng, 1.6, 3.4);

      return {
        id: i,
        size,
        top,
        delay: Number(delay),
        duration: Number(duration),
        opacity: Number(opacity.toFixed(2)),
        blur: Number(blur.toFixed(2)),
        drift: Number(drift.toFixed(0)),
        floatAmp: Number(floatAmp.toFixed(0)),
        floatDur: Number(floatDur.toFixed(2)),
        wiggleDur: Number(wiggleDur.toFixed(2)),
        direction,
        lane: Number(lane.toFixed(2)),
      };
    });
  }, [
    count,
    enabled,
    seed,
    safeTop,
    safeBottom,
    avoidMiddle,
    middleFrom,
    middleTo,
    maxOpacity,
  ]);

  if (!enabled) return null;

  return (
    <>
      <style jsx global>{`
        /* Cruce horizontal + curva suave */
        @keyframes bee-cross-lr {
          0% {
            transform: translateX(-16vw) translateY(0px);
          }
          25% {
            transform: translateX(20vw) translateY(var(--drift));
          }
          55% {
            transform: translateX(60vw) translateY(calc(var(--drift) * -0.6));
          }
          100% {
            transform: translateX(116vw) translateY(0px);
          }
        }

        @keyframes bee-cross-rl {
          0% {
            transform: translateX(116vw) translateY(0px) scaleX(-1);
          }
          25% {
            transform: translateX(70vw) translateY(var(--drift)) scaleX(-1);
          }
          55% {
            transform: translateX(35vw) translateY(calc(var(--drift) * -0.6))
              scaleX(-1);
          }
          100% {
            transform: translateX(-16vw) translateY(0px) scaleX(-1);
          }
        }

        /* Flotar */
        @keyframes bee-float {
          0% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(calc(var(--floatAmp) * -1));
          }
          100% {
            transform: translateY(0px);
          }
        }

        /* Wiggle muy sutil */
        @keyframes bee-wiggle {
          0% {
            rotate: -1deg;
          }
          50% {
            rotate: 1deg;
          }
          100% {
            rotate: -1deg;
          }
        }

        /* Alas: micro “brillo” */
        @keyframes bee-wings {
          0% {
            filter: drop-shadow(0 0 0 rgba(0, 0, 0, 0));
          }
          50% {
            filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.06));
          }
          100% {
            filter: drop-shadow(0 0 0 rgba(0, 0, 0, 0));
          }
        }
      `}</style>

      <div className="pointer-events-none absolute inset-0">
        {bees.map((b) => (
          <div
            key={b.id}
            className="absolute left-0"
            style={{
              top: `${b.top}%`,
              opacity: b.opacity,
              animationName: b.direction === "lr" ? "bee-cross-lr" : "bee-cross-rl",
              animationDuration: `${b.duration}s`,
              animationTimingFunction: "linear",
              animationIterationCount: "infinite",
              animationDelay: `${b.delay}s`,
              willChange: "transform",
              // variables para la curva/flotación
              ["--drift" as any]: `${b.drift}px`,
              ["--floatAmp" as any]: `${b.floatAmp}px`,
              // profundidad: abejas lejos quedan más atrás visualmente
              zIndex: b.lane < 0.45 ? 0 : 1,
            }}
          >
            <img
              src="/assets/bee.png"
              alt=""
              width={b.size}
              height={b.size}
              style={{
                filter: b.blur ? `blur(${b.blur}px)` : undefined,
                transformOrigin: "50% 50%",
                animation: `
                  bee-float ${b.floatDur}s ease-in-out infinite,
                  bee-wiggle ${b.wiggleDur}s ease-in-out infinite,
                  bee-wings 0.7s ease-in-out infinite
                `,
                willChange: "transform",
              }}
            />
          </div>
        ))}
      </div>
    </>
  );
}