"use client";

import dynamic from "next/dynamic";

// mapbox-gl touches `window` at module load time, so it can't be part of the
// server-rendered bundle for this route — ssr:false keeps it out of the SSR pass
// entirely, only ever loading and running in the browser.
const MapView = dynamic(() => import("./MapView").then((mod) => mod.MapView), {
  ssr: false,
});

export default function MapPage() {
  return <MapView />;
}
