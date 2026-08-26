"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { CircleNotch } from "@phosphor-icons/react/dist/ssr";
import { parseMapSearchParams, type MapSearchParams } from "../_lib/eventFilters";
import { fetchEvents, fetchFlagshipEvents, type Venue } from "../_lib/events";
import { initialMapFilters, mapFiltersToEventParams, type MapFilterState } from "../_lib/mapFilters";
import { useDebouncedValue } from "../_lib/useDebouncedValue";
import { VenueDetailPanel } from "./VenueDetailPanel";
import { MapLocationSearch } from "./MapLocationSearch";
import { MapLoadingIndicator } from "./MapLoadingIndicator";
import { MapFilterBar } from "./filters/MapFilterBar";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// Fallback framing when landing on /map with no search behind it (direct visit,
// refresh, no bbox params) — a reasonable default view rather than an error. Sits
// below MONUMENTS_ZOOM_THRESHOLD on purpose: with no search, there's no anchor, so
// this should land straight into monuments-only mode (flagship pins, nothing else).
const DEFAULT_CENTER: [number, number] = [-98.5795, 39.8283];
const DEFAULT_ZOOM = 4;

// Deliberately global/zoomed-out starting point for the search-arrival flyTo, so the
// camera has real distance to cover on the way to the destination. This is also what
// puts the map in globe-projection range at the start — Mapbox's own default
// projection switch (globe below its zoom threshold, Mercator above) then happens
// naturally as the flyTo's zoom climbs past it; nothing here forces or times that.
const GLOBE_START_CENTER: [number, number] = [0, 20];
const GLOBE_START_ZOOM = 1;

const FLY_TO_DURATION_MS = 2200;
const FLY_TO_PADDING_PX = 60;

// Below this, the map shows only flagship-festival "monuments" plus the anchor
// cluster (if any) — regular clusters/venues are hidden. Roughly "country/continent"
// scale: well above GLOBE_START_ZOOM/DEFAULT_ZOOM (so both arrival paths actually
// start in monuments mode) and well below where the arrival flyTo lands (a city is
// usually around zoom 9-11), so there's real room for normal clustering to live above
// it.
const MONUMENTS_ZOOM_THRESHOLD = 5;

// Keeps rapid pan/zoom movement (many moveend events in quick succession, e.g. during
// an animated fly-to or fast trackpad panning) from firing a GET /events request per
// event; only the bounds after movement settles down actually get queried.
const MOVEEND_DEBOUNCE_MS = 400;

// Same idea for filter changes — a chip removal followed immediately by a date pick
// shouldn't fire its own separate round of refetches on top of the next one.
const FILTER_DEBOUNCE_MS = 300;

// Sane starting ceiling for the events-per-venue slider before any real data has
// come back — replaced the moment a live-viewport fetch resolves with actual venues
// (see updateMaxEventsPerVenue).
const DEFAULT_MAX_EVENTS_PER_VENUE = 10;

const ACCENT_COLOR = "#e8368f";
const CLUSTER_COLOR = "#3f3f46";
const TEXT_FONT: [string, string] = ["Open Sans Bold", "Arial Unicode MS Bold"];

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

// Layer id groups toggled together as a unit when crossing MONUMENTS_ZOOM_THRESHOLD.
const LIVE_LAYER_IDS = ["live-clusters", "live-cluster-count", "live-unclustered"];
const ANCHOR_LAYER_IDS = ["anchor-clusters", "anchor-cluster-count", "anchor-unclustered"];
const MONUMENT_LAYER_IDS = ["monument-circle", "monument-icon"];
const INTERACTIVE_LAYER_IDS = [
  "live-clusters",
  "live-unclustered",
  "anchor-clusters",
  "anchor-unclustered",
  "monument-circle",
  "monument-icon",
];

export function MapView() {
  const searchParams = useSearchParams();
  const arrival = parseMapSearchParams(searchParams);

  // Keyed on the full query string so a brand-new search — whether from the landing
  // page or the on-map location search box — fully remounts the map below: fresh
  // mapboxgl.Map instance, fresh filter state, fresh everything. Simpler and more
  // robust than trying to reconcile old React/mapbox state into a new arrival in
  // place, and it's exactly the "start from the globe and flyTo" experience this is
  // supposed to have either way.
  return <MapViewInner key={searchParams.toString()} arrival={arrival} />;
}

function MapViewInner({ arrival }: { arrival: MapSearchParams | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Derived once at mount (see the key-based remount above) rather than kept in sync
  // with props — the effect below only ever needs to turn isTransitioning off (once
  // the flyTo + fetch both settle), never on, so the initial value fully covers the
  // "arrived from a search" case.
  const [isTransitioning, setIsTransitioning] = useState(() => arrival !== null);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  // Highest per-venue event count actually seen in the live viewport's most recent
  // response — feeds the events-per-venue slider's max (see EventCountControl), so
  // its range always reflects real data instead of a hardcoded ceiling.
  const [maxEventsPerVenue, setMaxEventsPerVenue] = useState(DEFAULT_MAX_EVENTS_PER_VENUE);
  // True only while a *filter-triggered* refetch (not a pan/zoom) is in flight —
  // drives the small MapLoadingIndicator badge, kept deliberately separate from
  // isTransitioning's full-screen overlay, which is reserved for the initial
  // search-arrival flyTo.
  const [isRefetching, setIsRefetching] = useState(false);

  const [filters, setFilters] = useState<MapFilterState>(() => initialMapFilters(arrival));
  const debouncedFilters = useDebouncedValue(filters, FILTER_DEBOUNCE_MS);
  // Read by the mapbox effect's fetch functions at call time, rather than closed
  // over directly, so a filter change doesn't require tearing down and rebuilding
  // the whole map (and replaying its flyTo) just to pick up a new artist chip.
  const filtersRef = useRef(filters);
  const refetchAllRef = useRef<{
    live: () => Promise<void>;
    anchor: () => Promise<void>;
    monuments: () => Promise<void>;
  } | null>(null);

  useEffect(() => {
    filtersRef.current = debouncedFilters;
    const handlers = refetchAllRef.current;
    // Null only on the very first render, before the mapbox effect below has run —
    // the initial arrival fetch (or the no-arrival initial fetchLiveVenues call)
    // already covers that case with its own loading treatment, so there's nothing
    // to do here yet.
    if (!handlers) return;

    setIsRefetching(true);
    Promise.allSettled([handlers.live(), handlers.anchor(), handlers.monuments()]).finally(() => {
      setIsRefetching(false);
    });
  }, [debouncedFilters]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!MAPBOX_TOKEN) {
      console.error("NEXT_PUBLIC_MAPBOX_TOKEN is not configured");
      return;
    }

    // React (Strict Mode, dev only) mounts, cleans up, and re-mounts every effect
    // once — with an imperative library like mapbox-gl that has in-flight async work
    // (flyTo, fetch), the first invocation's callbacks can otherwise still land after
    // its own cleanup already ran, racing the second (real) instance. Every async
    // continuation below checks this before touching state or the map.
    let cancelled = false;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const hasAnchor = arrival !== null;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: arrival ? GLOBE_START_CENTER : DEFAULT_CENTER,
      zoom: arrival ? GLOBE_START_ZOOM : DEFAULT_ZOOM,
    });

    // Every venue we've ever seen (live viewport, anchor, monuments) keyed by id, so a
    // click on any layer can look up the full Venue payload for the sidebar without
    // round-tripping rich data through GeoJSON feature properties.
    const venuesById = new Map<number, Venue>();
    function upsertVenues(venues: Venue[]) {
      for (const venue of venues) venuesById.set(venue.id, venue);
    }

    function setSourceData(sourceId: string, venues: Venue[]) {
      const source = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined;
      source?.setData(venuesToGeoJSON(venues));
    }

    // Recomputed fresh from whatever's currently in the live viewport, not
    // accumulated across pans — an empty response is left alone (keeps the previous
    // ceiling) rather than collapsing the slider's range to 0 for a viewport that
    // temporarily has nothing in it.
    function updateMaxEventsPerVenue(venues: Venue[]) {
      if (venues.length === 0) return;
      const max = Math.max(...venues.map((venue) => venue.totalEventCount));
      setMaxEventsPerVenue(Math.max(1, max));
    }

    function updateVisibility() {
      const monumentsMode = map.getZoom() < MONUMENTS_ZOOM_THRESHOLD;
      const liveVisibility = monumentsMode ? "none" : "visible";
      const monumentsVisibility = monumentsMode ? "visible" : "none";
      const anchorVisibility = monumentsMode && hasAnchor ? "visible" : "none";

      for (const id of LIVE_LAYER_IDS) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", liveVisibility);
      }
      for (const id of MONUMENT_LAYER_IDS) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", monumentsVisibility);
      }
      for (const id of ANCHOR_LAYER_IDS) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", anchorVisibility);
      }
    }

    // --- the three fetches that make up "what's on the map right now" — each reads
    // the latest filters off filtersRef so a filter change (see the debouncedFilters
    // effect above) can re-run all three without touching the map instance itself.

    // Each returns a Promise (resolving even when skipped or failed) so the
    // debouncedFilters effect above can await all three uniformly to know when to
    // clear the loading indicator, without caring which ones actually ran.
    function fetchLiveVenues(): Promise<void> {
      // Below the threshold the live layers are hidden anyway (monuments mode owns
      // the screen) — skip the network round-trip for data nobody will see.
      if (map.getZoom() < MONUMENTS_ZOOM_THRESHOLD) return Promise.resolve();

      const bounds = map.getBounds();
      if (!bounds) return Promise.resolve();

      return fetchEvents(
        {
          minLat: bounds.getSouth(),
          minLng: bounds.getWest(),
          maxLat: bounds.getNorth(),
          maxLng: bounds.getEast(),
        },
        mapFiltersToEventParams(filtersRef.current)
      )
        .then((venues) => {
          if (cancelled) return;
          upsertVenues(venues);
          setSourceData("live-venues", venues);
          updateMaxEventsPerVenue(venues);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          console.error("Failed to fetch events for current map bounds", err);
        });
    }

    // The anchor's bbox is fixed to wherever was originally searched, independent of
    // panning — but it still has to respect the active filters like everything else:
    // if the searched city has zero matching events under the current filters, this
    // sets the anchor source to an empty collection, which renders as no pin at all
    // rather than misrepresenting unfiltered data.
    function fetchAnchorVenues(): Promise<void> {
      if (!arrival) return Promise.resolve();

      return fetchEvents(
        {
          minLat: arrival.filters.minLat,
          minLng: arrival.filters.minLng,
          maxLat: arrival.filters.maxLat,
          maxLng: arrival.filters.maxLng,
        },
        mapFiltersToEventParams(filtersRef.current)
      )
        .then((venues) => {
          if (cancelled) return;
          upsertVenues(venues);
          setSourceData("anchor-venues", venues);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          console.error("Failed to fetch events for anchor city", err);
        });
    }

    function fetchMonumentVenues(): Promise<void> {
      return fetchFlagshipEvents(mapFiltersToEventParams(filtersRef.current))
        .then((venues) => {
          if (cancelled) return;
          upsertVenues(venues);
          setSourceData("monuments", venues);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          console.error("Failed to fetch flagship festivals", err);
        });
    }

    refetchAllRef.current = { live: fetchLiveVenues, anchor: fetchAnchorVenues, monuments: fetchMonumentVenues };

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    function handleMoveEnd() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(fetchLiveVenues, MOVEEND_DEBOUNCE_MS);
    }

    // Flies the camera back to the originally-searched city's framing — used by both
    // the anchor cluster's click handler and (if ever needed again) mirrors exactly
    // what the initial search-arrival flyTo already does with this same bbox.
    function flyToArrivalCity() {
      if (!arrival) return;
      const targetBounds: [[number, number], [number, number]] = [
        [arrival.filters.minLng, arrival.filters.minLat],
        [arrival.filters.maxLng, arrival.filters.maxLat],
      ];
      const camera = map.cameraForBounds(targetBounds, { padding: FLY_TO_PADDING_PX });
      if (camera) {
        map.flyTo({ ...camera, duration: FLY_TO_DURATION_MS, essential: true });
      } else {
        map.fitBounds(targetBounds, {
          padding: FLY_TO_PADDING_PX,
          duration: FLY_TO_DURATION_MS,
          essential: true,
        });
      }
    }

    map.on("load", () => {
      if (cancelled) return;

      map.addSource("live-venues", {
        type: "geojson",
        data: EMPTY_FEATURE_COLLECTION,
        cluster: true,
        clusterRadius: 50,
      });
      map.addSource("anchor-venues", {
        type: "geojson",
        data: EMPTY_FEATURE_COLLECTION,
        cluster: true,
        clusterRadius: 50,
      });
      map.addSource("monuments", { type: "geojson", data: EMPTY_FEATURE_COLLECTION });

      // --- normal-mode clustering (current viewport) ---
      map.addLayer({
        id: "live-clusters",
        type: "circle",
        source: "live-venues",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": CLUSTER_COLOR,
          "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 50, 26],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
      map.addLayer({
        id: "live-cluster-count",
        type: "symbol",
        source: "live-venues",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": TEXT_FONT,
          "text-size": 13,
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#ffffff" },
      });
      map.addLayer({
        id: "live-unclustered",
        type: "circle",
        source: "live-venues",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": CLUSTER_COLOR,
          "circle-radius": 6,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
        },
      });

      // --- anchor: the originally-searched city, styled distinctly, always sourced
      // from the one-time search-arrival fetch rather than the live/viewport source
      // so it never depends on — or gets clobbered by — panning elsewhere. ---
      map.addLayer({
        id: "anchor-clusters",
        type: "circle",
        source: "anchor-venues",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": ACCENT_COLOR,
          "circle-radius": ["step", ["get", "point_count"], 22, 10, 26, 50, 32],
          "circle-stroke-width": 3,
          "circle-stroke-color": "#ffffff",
        },
      });
      map.addLayer({
        id: "anchor-cluster-count",
        type: "symbol",
        source: "anchor-venues",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": TEXT_FONT,
          "text-size": 14,
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#ffffff" },
      });
      map.addLayer({
        id: "anchor-unclustered",
        type: "circle",
        source: "anchor-venues",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ACCENT_COLOR,
          "circle-radius": 10,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      // --- flagship festival "monuments" — landmark-style, always unclustered ---
      map.addLayer({
        id: "monument-circle",
        type: "circle",
        source: "monuments",
        paint: {
          "circle-color": ACCENT_COLOR,
          "circle-radius": 16,
          "circle-stroke-width": 3,
          "circle-stroke-color": "#ffffff",
        },
      });
      map.addLayer({
        id: "monument-icon",
        type: "symbol",
        source: "monuments",
        layout: {
          "text-field": "★",
          "text-font": TEXT_FONT,
          "text-size": 14,
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#ffffff" },
      });

      updateVisibility();
      map.on("zoom", () => {
        if (cancelled) return;
        updateVisibility();
      });

      // --- click handling ---
      function openVenueSidebar(e: mapboxgl.MapMouseEvent) {
        if (cancelled) return;
        const feature = e.features?.[0];
        const venueId = feature?.properties?.venueId;
        const venue = typeof venueId === "number" ? venuesById.get(venueId) : undefined;
        if (venue) setSelectedVenue(venue);
      }
      map.on("click", "live-unclustered", openVenueSidebar);
      map.on("click", "monument-circle", openVenueSidebar);
      map.on("click", "monument-icon", openVenueSidebar);

      function expandLiveCluster(e: mapboxgl.MapMouseEvent) {
        if (cancelled) return;
        const feature = e.features?.[0];
        const clusterId = feature?.properties?.cluster_id;
        const geometry = feature?.geometry;
        if (typeof clusterId !== "number" || geometry?.type !== "Point") return;
        const source = map.getSource("live-venues") as mapboxgl.GeoJSONSource;
        source.getClusterExpansionZoom(clusterId, (err: unknown, zoom: number | null | undefined) => {
          if (err || cancelled || typeof zoom !== "number") return;
          map.easeTo({ center: geometry.coordinates as [number, number], zoom });
        });
      }
      map.on("click", "live-clusters", expandLiveCluster);

      // The anchor never opens the sidebar directly — it represents "where you
      // searched", not a single venue — clicking it (cluster bubble or, in the rare
      // edge case of a single-venue search, an unclustered point) always flies back
      // to the searched city instead, same as clicking any other cluster does.
      //
      // A monument can sit right on top of the anchor (e.g. the searched city itself
      // hosts a flagship festival) — Mapbox fires every layer's click handler that has
      // a feature at the clicked point, not just the topmost one, so without this
      // check both the sidebar-open (monument) and fly-back (anchor) actions would
      // fire from the same click. The monument — a specific festival — wins; a click
      // that clearly landed on it shouldn't also silently move the camera.
      function handleAnchorClick(e: mapboxgl.MapMouseEvent) {
        if (cancelled) return;
        const monumentLayers = MONUMENT_LAYER_IDS.filter((id) => map.getLayer(id));
        const monumentHit = map.queryRenderedFeatures(e.point, { layers: monumentLayers });
        if (monumentHit.length > 0) return;
        flyToArrivalCity();
      }
      map.on("click", "anchor-clusters", handleAnchorClick);
      map.on("click", "anchor-unclustered", handleAnchorClick);

      for (const id of INTERACTIVE_LAYER_IDS) {
        map.on("mouseenter", id, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", id, () => {
          map.getCanvas().style.cursor = "";
        });
      }

      // "Click elsewhere closes the panel" — but these layers render on the canvas
      // itself (no separate DOM element to stopPropagation from, unlike the old
      // per-venue Marker() approach), so the map's own click handler fires for every
      // click regardless of what was clicked. queryRenderedFeatures at the click
      // point is how you tell "clicked a pin" apart from "clicked empty map" here.
      map.on("click", (e) => {
        if (cancelled) return;
        const layers = INTERACTIVE_LAYER_IDS.filter((id) => map.getLayer(id));
        const features = map.queryRenderedFeatures(e.point, { layers });
        if (features.length > 0) return;
        setSelectedVenue(null);
      });

      // Flagship monuments are global and effectively static — fetched once here
      // regardless of arrival/no-arrival, independent of viewport panning (and
      // re-fetched whenever filters change, see the debouncedFilters effect above).
      fetchMonumentVenues();

      if (arrival) {
        let animationDone = false;
        let dataReady = false;
        function checkTransitionComplete() {
          if (cancelled) return;
          if (animationDone && dataReady) {
            setIsTransitioning(false);
          }
        }

        // Fires immediately, in parallel with the flyTo below — the camera arriving
        // and the data arriving race each other, and whichever finishes last is what
        // clears the overlay (see checkTransitionComplete). This same fetch also
        // becomes the anchor source's data — the anchor is nothing more than this
        // one-time result, clustered and re-styled. It also seeds live-venues: the
        // flyTo's own first moveend deliberately doesn't trigger handleMoveEnd (see
        // below, to avoid double-fetching this same bbox), so without this, normal
        // clustering would stay empty until the user panned a second time.
        fetchEvents(
          {
            minLat: arrival.filters.minLat,
            minLng: arrival.filters.minLng,
            maxLat: arrival.filters.maxLat,
            maxLng: arrival.filters.maxLng,
          },
          mapFiltersToEventParams(filtersRef.current)
        )
          .then((venues) => {
            if (cancelled) return;
            upsertVenues(venues);
            setSourceData("anchor-venues", venues);
            setSourceData("live-venues", venues);
            updateMaxEventsPerVenue(venues);
          })
          .catch((err: unknown) => {
            if (cancelled) return;
            console.error("Failed to fetch events for search arrival", err);
          })
          .finally(() => {
            if (cancelled) return;
            dataReady = true;
            checkTransitionComplete();
          });

        const targetBounds: [[number, number], [number, number]] = [
          [arrival.filters.minLng, arrival.filters.minLat],
          [arrival.filters.maxLng, arrival.filters.maxLat],
        ];

        map.once("moveend", () => {
          if (cancelled) return;
          animationDone = true;
          checkTransitionComplete();
          // Only now start listening for further user-driven panning, so this
          // arrival flyTo's own moveend doesn't trigger a redundant refetch on top
          // of the one already in flight above.
          map.on("moveend", handleMoveEnd);
        });

        const camera = map.cameraForBounds(targetBounds, { padding: FLY_TO_PADDING_PX });
        // essential:true is required here, not optional polish — without it, Mapbox
        // silently skips the whole flyTo animation and jumps straight to the target
        // whenever the OS/browser has "reduce motion" enabled, which reads as "the
        // animation doesn't work" even though flyTo is being called correctly with
        // the right duration. This transition is the core designed experience here,
        // not decorative chrome, so it plays regardless of that preference.
        if (camera) {
          map.flyTo({ ...camera, duration: FLY_TO_DURATION_MS, essential: true });
        } else {
          map.fitBounds(targetBounds, {
            padding: FLY_TO_PADDING_PX,
            duration: FLY_TO_DURATION_MS,
            essential: true,
          });
        }
      } else {
        map.on("moveend", handleMoveEnd);
        fetchLiveVenues();
      }
    });

    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      map.remove();
    };
    // Intentionally runs once per mount: MapViewInner is fully remounted (fresh key)
    // whenever `arrival` actually changes (see MapView above), so this doesn't need
    // to react to prop changes itself — only filtersRef (read at call time, not
    // captured here) needs to change without tearing the map down.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative flex h-screen w-screen overflow-hidden">
      {/* Fixed-width structural column, not a floating card — takes real layout
          space so the map area (and everything positioned within it) starts after
          it, the way Google Maps' results panel pushes its search bar over rather
          than sitting underneath it. */}
      {selectedVenue && (
        <VenueDetailPanel venue={selectedVenue} onClose={() => setSelectedVenue(null)} />
      )}

      <div className="relative flex-1">
        {/* h-full/w-full rather than absolute+inset-0: mapbox-gl.css ships its own
            `.mapboxgl-map { position: relative }` rule, and since it's imported
            after Tailwind's generated stylesheet, it wins the (equal-specificity,
            later-in-cascade) fight over a plain `absolute` utility class here —
            silently collapsing an inset-0 box to zero height since "relative" with
            insets isn't the same layout as "absolute" with insets. Explicit
            height/width utilities size correctly regardless of which position value
            wins. */}
        <div ref={containerRef} className="h-full w-full" />

        <div className="absolute left-4 right-4 top-4 z-20 flex flex-col items-start gap-3">
          <MapLocationSearch artists={filters.artists} />
          <MapFilterBar filters={filters} onChange={setFilters} maxEventsPerVenue={maxEventsPerVenue} />
        </div>

        {isRefetching && (
          <div className="absolute bottom-4 right-4 z-20">
            <MapLoadingIndicator />
          </div>
        )}
      </div>

      {isTransitioning && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/60 backdrop-blur-sm">
          <CircleNotch className="animate-spin text-white" size={36} weight="bold" />
          <p className="text-lg font-medium text-white">
            Searching for {arrival?.locationName ?? "your area"}…
          </p>
        </div>
      )}
    </div>
  );
}
