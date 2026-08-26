"use client";

import dynamic from "next/dynamic";

// mapbox-gl touches `window` at import time, so it needs the ssr:false escape hatch
// (same reasoning as /map/page.tsx) — this wrapper is itself a Client Component so
// the landing page (a Server Component) can still import it directly, same as
// SearchBar, without tripping Next's "ssr:false in a Server Component" error.
const LandingMap = dynamic(() => import("./LandingMap").then((mod) => mod.LandingMap), {
  ssr: false,
});

export function LandingMapLoader() {
  return <LandingMap />;
}
