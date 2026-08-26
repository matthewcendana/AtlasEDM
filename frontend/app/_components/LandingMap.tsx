"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// Purely decorative: a wide view of the globe biased toward the Atlantic, echoing the
// crop of the static world-map graphic this replaces. No event data, no API calls —
// just a live, pannable/zoomable basemap for atmosphere behind the search panel.
const DEFAULT_CENTER: [number, number] = [-40, 20];
const DEFAULT_ZOOM = 1.6;

export function LandingMap() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!MAPBOX_TOKEN) {
      console.error("NEXT_PUBLIC_MAPBOX_TOKEN is not configured");
      return;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;

    // dark-v11 instead of the default streets style used on /map: this panel sits on
    // bg-panel-dark next to a near-black hero, and a light basemap here would break
    // the page's dark-mode theme lock.
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.AttributionControl({ compact: true }));

    return () => map.remove();
  }, []);

  return <div ref={containerRef} className="h-full w-full opacity-90" />;
}
