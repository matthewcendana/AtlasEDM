"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { AnimatePresence } from "motion/react";
import { fetchFlagshipEvents, type Venue } from "../_lib/events";
import { buildPinIcon, PIN_COLOR_DEFAULT, PIN_COLOR_SELECTED } from "../_lib/mapPinIcon";
import { FestivalPopupCard } from "./FestivalPopupCard";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// A wide view of the globe biased toward the Atlantic, echoing the crop of the
// static world-map graphic this replaces. Live and interactive — pannable/zoomable,
// with real flagship-festival pins (see below) — rather than purely decorative.
const DEFAULT_CENTER: [number, number] = [-40, 20];
const DEFAULT_ZOOM = 1.6;

// Two pin images (not one recolored per-feature): the selected pin is a second,
// always-on-top overlay layer with at most one feature, rather than data-driven
// per-feature styling on the base layer — simpler than Mapbox feature-state, and
// just as correct since only one festival is ever selected at a time. Mirrors
// /map's own MapView.tsx pin setup exactly.
const FLAGSHIP_PIN_ICON_ID = "flagship-pin-icon";
const SELECTED_FLAGSHIP_PIN_ICON_ID = "flagship-pin-icon-selected";
const FLAGSHIP_LAYER_ID = "flagship-pins";
const SELECTED_FLAGSHIP_LAYER_ID = "selected-flagship-pin";

const EMPTY_FEATURE_COLLECTION: GeoJSON.FeatureCollection<GeoJSON.Point> = {
  type: "FeatureCollection",
  features: [],
};

function venuesToGeoJSON(venues: Venue[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: venues.map((venue) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [venue.longitude, venue.latitude] },
      properties: { venueId: venue.id },
    })),
  };
}

// Rough footprint of FestivalPopupCard (see its w-72/max-h-80 classes) — used to
// compute a position that fits within the container instead of measuring the real
// rendered card (which isn't in the DOM yet at click time, only after this state
// update commits).
const CARD_WIDTH_PX = 288;
const CARD_MAX_HEIGHT_PX = 320;
const PIN_GAP_PX = 14;
const EDGE_PADDING_PX = 8;

interface PopupPosition {
  venue: Venue;
  style: React.CSSProperties;
}

// Anchors the card to whichever side of the clicked pin has more room, using the
// click point's position relative to the globe container — a pin clicked on the
// right half gets a card to its left, and vice versa, so it's never clipped by the
// container edge (and, in the side-by-side desktop layout, never reaches left far
// enough to overlap the search bar in the other column). `right`/`left` positioning
// (rather than always `left` with a computed offset) means the card doesn't need to
// know its own exact rendered width to avoid overlapping the pin it came from.
function computePopupPosition(
  venue: Venue,
  clickX: number,
  clickY: number,
  containerWidth: number,
  containerHeight: number
): PopupPosition {
  const cardHeight = Math.min(CARD_MAX_HEIGHT_PX, Math.max(containerHeight - EDGE_PADDING_PX * 2, 0));
  const top = Math.min(
    Math.max(clickY - cardHeight / 2, EDGE_PADDING_PX),
    Math.max(EDGE_PADDING_PX, containerHeight - cardHeight - EDGE_PADDING_PX)
  );

  const onRightHalf = clickX > containerWidth / 2;
  if (onRightHalf) {
    const right = Math.max(EDGE_PADDING_PX, containerWidth - clickX + PIN_GAP_PX);
    return { venue, style: { top, right, maxHeight: cardHeight } };
  }
  const left = Math.max(
    EDGE_PADDING_PX,
    Math.min(clickX + PIN_GAP_PX, containerWidth - CARD_WIDTH_PX - EDGE_PADDING_PX)
  );
  return { venue, style: { top, left, maxHeight: cardHeight } };
}

export function LandingMap() {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [popup, setPopup] = useState<PopupPosition | null>(null);
  // Exposes the live map instance to the selected-pin effect below — see MapView.tsx
  // for the identical pattern and its own comment.
  const mapRef = useRef<mapboxgl.Map | null>(null);

  // Draws the pink "selected" pin exactly on top of the clicked festival's black
  // base pin — mirrors MapView.tsx's own selected-pin effect.
  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource("selected-flagship-venue") as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData(popup ? venuesToGeoJSON([popup.venue]) : EMPTY_FEATURE_COLLECTION);
  }, [popup]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!MAPBOX_TOKEN) {
      console.error("NEXT_PUBLIC_MAPBOX_TOKEN is not configured");
      return;
    }

    let cancelled = false;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/matthewcendana/cmtcg33vd002801sn58vxfo5f",
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
      // This globe is meant to stay pannable/zoomable (spinnable), but pitch/
      // bearing-rotate has no legitimate use here and can be dragged into a
      // disorienting, heavily-tilted view — locked at both the interaction level
      // and the camera level. See MapView.tsx's identical setup for the full
      // reasoning.
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxPitch: 0,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new mapboxgl.AttributionControl({ compact: true }));
    mapRef.current = map;

    const venuesById = new Map<number, Venue>();

    map.on("load", () => {
      if (cancelled) return;

      map.addSource("flagship-venues", { type: "geojson", data: EMPTY_FEATURE_COLLECTION });
      // Always either empty or a single feature (the selected festival) — see the
      // selected-pin effect above.
      map.addSource("selected-flagship-venue", { type: "geojson", data: EMPTY_FEATURE_COLLECTION });

      if (!map.hasImage(FLAGSHIP_PIN_ICON_ID)) {
        map.addImage(FLAGSHIP_PIN_ICON_ID, buildPinIcon(PIN_COLOR_DEFAULT), { pixelRatio: 1 });
      }
      if (!map.hasImage(SELECTED_FLAGSHIP_PIN_ICON_ID)) {
        map.addImage(SELECTED_FLAGSHIP_PIN_ICON_ID, buildPinIcon(PIN_COLOR_SELECTED), { pixelRatio: 1 });
      }

      const pinLayout = (iconImage: string): mapboxgl.SymbolLayerSpecification["layout"] => ({
        "icon-image": iconImage,
        "icon-size": 1,
        "icon-anchor": "bottom",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      });

      map.addLayer({
        id: FLAGSHIP_LAYER_ID,
        type: "symbol",
        source: "flagship-venues",
        layout: pinLayout(FLAGSHIP_PIN_ICON_ID),
      });
      // Added after (so it paints on top of) the base layer.
      map.addLayer({
        id: SELECTED_FLAGSHIP_LAYER_ID,
        type: "symbol",
        source: "selected-flagship-venue",
        layout: pinLayout(SELECTED_FLAGSHIP_PIN_ICON_ID),
      });

      map.on("mouseenter", FLAGSHIP_LAYER_ID, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", FLAGSHIP_LAYER_ID, () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("click", FLAGSHIP_LAYER_ID, (e) => {
        if (cancelled || !wrapperRef.current) return;
        const feature = e.features?.[0];
        const venueId = feature?.properties?.venueId;
        const venue = typeof venueId === "number" ? venuesById.get(venueId) : undefined;
        if (!venue) return;

        const rect = wrapperRef.current.getBoundingClientRect();
        setPopup(computePopupPosition(venue, e.point.x, e.point.y, rect.width, rect.height));
      });

      // Clicking anywhere else on the globe (not a pin) closes whatever card is
      // open — same "queryRenderedFeatures at the click point" trick /map uses,
      // since this layer renders on the canvas with no separate DOM element per pin
      // to stopPropagation from.
      map.on("click", (e) => {
        if (cancelled) return;
        const features = map.queryRenderedFeatures(e.point, { layers: [FLAGSHIP_LAYER_ID] });
        if (features.length > 0) return;
        setPopup(null);
      });

      // A card anchored to a specific screen point stops making sense the moment
      // the globe moves under it — close rather than leave it floating over the
      // wrong spot. Doesn't affect picking a *different* pin, which sets its own
      // fresh popup state after this fires (dragstart doesn't happen from a pin
      // click, only from actually dragging the globe).
      map.on("dragstart", () => {
        if (cancelled) return;
        setPopup(null);
      });

      fetchFlagshipEvents()
        .then((venues) => {
          if (cancelled) return;
          for (const venue of venues) venuesById.set(venue.id, venue);
          const source = map.getSource("flagship-venues") as mapboxgl.GeoJSONSource | undefined;
          source?.setData(venuesToGeoJSON(venues));
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          console.error("Failed to fetch flagship festivals for the homepage globe", err);
        });
    });

    return () => {
      cancelled = true;
      mapRef.current = null;
      map.remove();
    };
  }, []);

  return (
    <div ref={wrapperRef} className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full opacity-90" />
      <AnimatePresence>
        {popup && (
          <FestivalPopupCard venue={popup.venue} style={popup.style} onClose={() => setPopup(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
