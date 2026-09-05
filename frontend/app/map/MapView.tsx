"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { CircleNotch } from "@phosphor-icons/react/dist/ssr";
import { parseMapSearchParams, type MapSearchParams } from "../_lib/eventFilters";
import { fetchEvents, type Venue } from "../_lib/events";
import { initialMapFilters, mapFiltersToEventParams, type MapFilterState } from "../_lib/mapFilters";
import { FALLBACK_BBOX_PADDING_DEGREES, boundingBoxAroundPoint } from "../_lib/mapbox";
import { useDebouncedValue } from "../_lib/useDebouncedValue";
import { buildPinIcon, PIN_COLOR_DEFAULT, PIN_COLOR_SELECTED } from "../_lib/mapPinIcon";
import { wasMapReachedByClientNavigation } from "../_lib/mapNavigation";
import { VenueDetailPanel } from "./VenueDetailPanel";
import { MapLocationSearch } from "./MapLocationSearch";
import { MapLoadingIndicator } from "./MapLoadingIndicator";
import { MapFilterBar } from "./filters/MapFilterBar";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// Fallback framing when landing on /map with no search behind it (direct visit,
// refresh, no bbox params) — a reasonable default view rather than an error.
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

// Keeps rapid pan/zoom movement (many moveend events in quick succession, e.g. during
// an animated fly-to or fast trackpad panning) from firing a GET /events request per
// event; only the bounds after movement settles down actually get queried.
const MOVEEND_DEBOUNCE_MS = 400;

// Same idea for filter changes — a chip removal followed immediately by a date pick
// shouldn't fire its own separate round of refetches on top of the next one.
const FILTER_DEBOUNCE_MS = 300;

// Extra pan room beyond wherever the zoom floor's own extent lands, as a fraction of
// that extent's own width/height — see lockViewportToCurrentPosition's maxBounds
// logic below. 0.5 means the pannable area is 2x the floor's own width/height:
// enough to look around the immediate area without being able to drag into a
// genuinely different city.
const MAX_BOUNDS_SLACK_RATIO = 0.5;

// Raster ids registered with map.addImage for the individual venue marker (see
// buildPinIcon) — referenced by the "live-venue-pins"/"selected-venue-pin" symbol
// layers below. Two images (not one recolored per-feature) because the selected pin
// is rendered as a second, always-on-top overlay layer containing at most one
// feature, rather than data-driven per-feature styling on the base layer — simpler
// than wiring up Mapbox feature-state, and just as correct since only one venue can
// ever be selected at a time.
const VENUE_PIN_ICON_ID = "venue-pin-icon";
const SELECTED_VENUE_PIN_ICON_ID = "venue-pin-icon-selected";

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

const LIVE_LAYER_ID = "live-venue-pins";
const SELECTED_LAYER_ID = "selected-venue-pin";

// A real browser refresh (Cmd/Ctrl+R) re-runs this module from scratch, so
// wasMapReachedByClientNavigation() is false and this is the only signal left to
// consult: the Navigation Timing API's entry `type`, which is "reload" only for an
// actual reload of the currently-loaded document — never for a client-side
// `router.push`, which doesn't create a new navigation entry at all. A direct/typed
// visit or a shared link lands here as "navigate", not "reload", so it's
// deliberately treated the same as before this change (falls through to MapView's
// existing no-arrival default view) — only a genuine refresh should bounce to `/`.
// Computed synchronously in useState's initializer (not an effect) so there's no
// render where a soon-to-be-redirected page flashes on screen first.
function shouldRenderMapOnMount(): boolean {
  if (wasMapReachedByClientNavigation()) return true;
  const [entry] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
  return entry?.type !== "reload";
}

export function MapView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const arrival = parseMapSearchParams(searchParams);
  const [allowed] = useState(shouldRenderMapOnMount);

  useEffect(() => {
    if (!allowed) router.replace("/");
  }, [allowed, router]);

  if (!allowed) return null;

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
  const refetchLiveRef = useRef<(() => Promise<void>) | null>(null);
  // Exposes the live map instance to the selected-pin effect below, which reacts to
  // `selectedVenue` changes from a separate effect than the one that constructs the
  // map — mapboxgl.Map isn't itself React state, so this is the plumbing that lets a
  // second effect reach the same instance.
  const mapRef = useRef<mapboxgl.Map | null>(null);

  // Draws the pink "selected" pin exactly on top of the clicked venue's black base
  // pin (see SELECTED_LAYER_ID below) — a second one-feature-or-empty source, rather
  // than data-driven per-feature coloring on the base layer, since only one venue is
  // ever selected at a time and this avoids wiring up Mapbox feature-state.
  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource("selected-venue") as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData(selectedVenue ? venuesToGeoJSON([selectedVenue]) : EMPTY_FEATURE_COLLECTION);
  }, [selectedVenue]);

  useEffect(() => {
    filtersRef.current = debouncedFilters;
    const refetchLive = refetchLiveRef.current;
    // Null only on the very first render, before the mapbox effect below has run —
    // the initial arrival fetch (or the no-arrival initial fetchLiveVenues call)
    // already covers that case with its own loading treatment, so there's nothing
    // to do here yet.
    if (!refetchLive) return;

    setIsRefetching(true);
    refetchLive().finally(() => {
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

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/matthewcendana/cmtcg33vd002801sn58vxfo5f",
      center: arrival ? GLOBE_START_CENTER : DEFAULT_CENTER,
      zoom: arrival ? GLOBE_START_ZOOM : DEFAULT_ZOOM,
      // This app is a flat top-down map, never a 3D scene — pitch/bearing-rotate
      // (right-click-drag, or two-finger twist on touch) has no legitimate use here
      // and can be dragged into a disorienting, heavily-tilted view of the globe
      // projection the arrival flyTo briefly passes through. Locked at both the
      // interaction level (dragRotate/pitchWithRotate/touchPitch) and the camera
      // level (maxPitch: 0) so no input path — mouse, touch, or a future one — can
      // reach a pitched state; pan and zoom are untouched.
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxPitch: 0,
    });
    // touchZoomRotate is a single handler covering both pinch-zoom and twist-to-
    // rotate; disabling it outright would also kill pinch-zoom, which should stay.
    // disableRotation() removes just the rotate half.
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;

    // Every venue we've ever seen, keyed by id, so a click on a pin can look up the
    // full Venue payload for the sidebar without round-tripping rich data through
    // GeoJSON feature properties.
    const venuesById = new Map<number, Venue>();
    function upsertVenues(venues: Venue[]) {
      for (const venue of venues) venuesById.set(venue.id, venue);
    }

    function setSourceData(sourceId: string, venues: Venue[]) {
      const source = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined;
      source?.setData(venuesToGeoJSON(venues));
    }

    // The one and only "what's on the map right now" fetch — always runs off the
    // current viewport, at any zoom level. There is no low-zoom special case here
    // anymore: flagship-festival discovery lives on the homepage globe instead (see
    // LandingMap.tsx), and /map's own zoom-out floor (see setMinZoom below) is what
    // now keeps the view from wandering out to a scale with nothing useful to show.
    function fetchLiveVenues(): Promise<void> {
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
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          console.error("Failed to fetch events for current map bounds", err);
        });
    }

    refetchLiveRef.current = fetchLiveVenues;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    function handleMoveEnd() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(fetchLiveVenues, MOVEEND_DEBOUNCE_MS);
    }

    // Locks both the map's zoom-out floor AND its pan bounds to wherever the camera
    // actually landed — a dense-metro search (which lands zoomed further in) and a
    // sparse one each get their own correctly-calibrated constraints instead of a
    // shared fixed number. The user can still zoom in freely and pan around the
    // local area from there; zooming out or panning away just can't go far enough to
    // reach a different city. Called once the landing camera position is final
    // (after the arrival flyTo's own moveend, or immediately for the no-arrival
    // default view, which never animates) — never before, since constraining the
    // camera while the flyTo is still climbing from GLOBE_START_ZOOM would clamp the
    // animation itself.
    //
    // The zoom floor is never locked *tighter* than a baseline city-scale radius
    // around wherever it landed, even if the landing itself was much tighter (e.g. a
    // venue arrival, framed close enough that only its own pin shows on arrival —
    // see venues.ts's VENUE_BBOX_PADDING_DEGREES). Without this, the floor would
    // lock at that same tight zoom, permanently capping how far the user could ever
    // zoom out on this map instance at roughly the venue's own city block — no
    // amount of zooming out would ever reveal a nearby pin a few hundred meters
    // away, let alone the rest of the city. A normal city search's own bbox is
    // already at least this wide (usually much wider), so `Math.min` below is a
    // no-op for it: this only changes anything for an arrival tighter than
    // FALLBACK_BBOX_PADDING_DEGREES.
    function lockViewportToCurrentPosition() {
      if (cancelled) return;
      const landedZoom = map.getZoom();
      const center = map.getCenter();
      const cityScaleBounds = boundingBoxAroundPoint(center.lat, center.lng, FALLBACK_BBOX_PADDING_DEGREES);
      const cityScaleCamera = map.cameraForBounds(
        [
          [cityScaleBounds.minLng, cityScaleBounds.minLat],
          [cityScaleBounds.maxLng, cityScaleBounds.maxLat],
        ],
        { padding: FLY_TO_PADDING_PX }
      );
      const floorZoom =
        cityScaleCamera?.zoom !== undefined ? Math.min(landedZoom, cityScaleCamera.zoom) : landedZoom;
      map.setMinZoom(floorZoom);

      // Pan bound: the union of the same city-scale reference box the zoom floor
      // uses above and the landed viewport's own actual visible bounds (whichever
      // is wider governs — the same "never tighter than city-scale" rule as
      // floorZoom), padded with extra slack (MAX_BOUNDS_SLACK_RATIO) so panning at
      // the floor zoom isn't immediately wall-to-wall. This is an *additional*
      // constraint alongside the zoom floor, not a replacement for it — the padded
      // union is deliberately wider than the floor's own extent, so setMinZoom (the
      // tighter of the two) stays the binding zoom-out limit; maxBounds only ever
      // ends up constraining panning, matching Mapbox's own behavior of taking
      // whichever of an explicit minZoom and a maxBounds-implied zoom limit is more
      // restrictive.
      const landedBounds = map.getBounds();
      if (landedBounds) {
        const unionMinLat = Math.min(cityScaleBounds.minLat, landedBounds.getSouth());
        const unionMinLng = Math.min(cityScaleBounds.minLng, landedBounds.getWest());
        const unionMaxLat = Math.max(cityScaleBounds.maxLat, landedBounds.getNorth());
        const unionMaxLng = Math.max(cityScaleBounds.maxLng, landedBounds.getEast());
        const latSlack = (unionMaxLat - unionMinLat) * MAX_BOUNDS_SLACK_RATIO;
        const lngSlack = (unionMaxLng - unionMinLng) * MAX_BOUNDS_SLACK_RATIO;
        const bounds: [[number, number], [number, number]] = [
          [unionMinLng - lngSlack, unionMinLat - latSlack],
          [unionMaxLng + lngSlack, unionMaxLat + latSlack],
        ];
        map.setMaxBounds(bounds);
      }
    }

    map.on("load", () => {
      if (cancelled) return;

      // --- every venue in the current viewport, as its own individual icon pin —
      // no clustering, no aggregation, no numbered bubbles at any zoom level. If
      // pins visually overlap at a given zoom, that's expected: the fix is the user
      // zooming in further, not an aggregation UI. ---
      map.addSource("live-venues", { type: "geojson", data: EMPTY_FEATURE_COLLECTION });
      // Always either empty or a single feature (the selected venue) — see the
      // selected-pin effect above. A separate source/layer stacked on top of
      // live-venues rather than per-feature styling on it, so the selected venue's
      // pin visually "turns pink" by being fully covered by an identical pink pin
      // at the same coordinates.
      map.addSource("selected-venue", { type: "geojson", data: EMPTY_FEATURE_COLLECTION });

      if (!map.hasImage(VENUE_PIN_ICON_ID)) {
        map.addImage(VENUE_PIN_ICON_ID, buildPinIcon(PIN_COLOR_DEFAULT), { pixelRatio: 1 });
      }
      if (!map.hasImage(SELECTED_VENUE_PIN_ICON_ID)) {
        map.addImage(SELECTED_VENUE_PIN_ICON_ID, buildPinIcon(PIN_COLOR_SELECTED), { pixelRatio: 1 });
      }

      const pinLayout = (iconImage: string): mapboxgl.SymbolLayerSpecification["layout"] => ({
        "icon-image": iconImage,
        "icon-size": 1,
        "icon-anchor": "bottom",
        // Every venue must render as its own clickable pin, even when several
        // overlap at the current zoom — collision-based hiding would silently
        // drop pins, which is exactly the "missing venue" bug this replaces.
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      });

      map.addLayer({
        id: LIVE_LAYER_ID,
        type: "symbol",
        source: "live-venues",
        layout: pinLayout(VENUE_PIN_ICON_ID),
      });
      // Added after (so it paints on top of) the base layer.
      map.addLayer({
        id: SELECTED_LAYER_ID,
        type: "symbol",
        source: "selected-venue",
        layout: pinLayout(SELECTED_VENUE_PIN_ICON_ID),
      });

      // --- click handling ---
      function openVenueSidebar(e: mapboxgl.MapMouseEvent) {
        if (cancelled) return;
        const feature = e.features?.[0];
        const venueId = feature?.properties?.venueId;
        const venue = typeof venueId === "number" ? venuesById.get(venueId) : undefined;
        if (venue) setSelectedVenue(venue);
      }
      map.on("click", LIVE_LAYER_ID, openVenueSidebar);

      map.on("mouseenter", LIVE_LAYER_ID, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", LIVE_LAYER_ID, () => {
        map.getCanvas().style.cursor = "";
      });

      // "Click elsewhere closes the panel" — but this layer renders on the canvas
      // itself (no separate DOM element to stopPropagation from, unlike the old
      // per-venue Marker() approach), so the map's own click handler fires for every
      // click regardless of what was clicked. queryRenderedFeatures at the click
      // point is how you tell "clicked a pin" apart from "clicked empty map" here.
      map.on("click", (e) => {
        if (cancelled) return;
        const features = map.queryRenderedFeatures(e.point, { layers: [LIVE_LAYER_ID] });
        if (features.length > 0) return;
        setSelectedVenue(null);
      });

      if (arrival) {
        let animationDone = false;
        let dataReady = false;
        function checkTransitionComplete() {
          if (cancelled) return;
          if (animationDone && dataReady) {
            setIsTransitioning(false);
          }
        }

        const targetBounds: [[number, number], [number, number]] = [
          [arrival.filters.minLng, arrival.filters.minLat],
          [arrival.filters.maxLng, arrival.filters.maxLat],
        ];

        map.once("moveend", () => {
          if (cancelled) return;
          animationDone = true;
          lockViewportToCurrentPosition();
          checkTransitionComplete();
          // The flyTo's own landing spot — not the originally-requested bbox, which
          // can differ slightly once padding/aspect-ratio fitting is applied — is
          // what gets fetched, shown, and locked in as the zoom-out floor.
          fetchLiveVenues().finally(() => {
            if (cancelled) return;
            dataReady = true;
            checkTransitionComplete();
          });
          // Only now start listening for further user-driven panning, so this
          // arrival flyTo's own moveend doesn't trigger a redundant second fetch on
          // top of the one just kicked off above.
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
        // No animation to wait out here — the map already starts at its final
        // position (DEFAULT_CENTER/DEFAULT_ZOOM), so the floor locks immediately.
        lockViewportToCurrentPosition();
        map.on("moveend", handleMoveEnd);
        fetchLiveVenues();
      }
    });

    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      mapRef.current = null;
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
          <MapLocationSearch arrival={arrival} filters={filters} />
          <MapFilterBar filters={filters} onChange={setFilters} />
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
