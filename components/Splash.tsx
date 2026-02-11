"use client";

import { useEffect, useState } from "react";

export default function Splash({ visible }: { visible: boolean }) {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    if (!visible) setFadeOut(true);
  }, [visible]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black transition-opacity duration-1000 ${
        fadeOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      <video
        autoPlay
        muted
        playsInline
        className="absolute w-full h-full object-cover"
      >
        <source src="/splash.mp4" type="video/mp4" />
      </video>
    </div>
  );
}