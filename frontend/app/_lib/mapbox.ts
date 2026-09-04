const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const GEOCODE_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places";

// City-level and finer only — a country or region result produces a bounding box wide
// enough to pull in far more venue pins than the map can present cleanly, especially
// with clustering removed entirely (every pin renders individually, no aggregation
// anywhere). `region`/`country`/`postcode`/`district` are deliberately excluded: they
// sit at or above city granularity (a `district` in Mapbox's own taxonomy can be as
// wide as a county). This only filters which of Mapbox's own result *types* come back
// — a city that happens to share a name with a country or region (e.g. "Georgia")
// still resolves fine, since Mapbox still matches the query text against city-level
// features, it just never returns the country/region-typed feature alongside it.
const GEOCODE_TYPES = "place,locality,neighborhood,address,poi";

// Mapbox omits `bbox` for some area types (e.g. neighborhoods) and always omits it for
// point-only types; when that happens we pad a small box around the feature's center.
// This is a city/neighborhood-scale value — appropriate for those area types, which
// are themselves city-scale even when Mapbox happens not to hand back an explicit
// bbox for one. Venue arrivals use their own much tighter padding instead (see
// VENUE_BBOX_PADDING_DEGREES in venues.ts) — a single venue is a landmark-scale point,
// not an area, and landing this wide put other nearby venues' pins in view immediately
// on arrival, defeating the point of searching a specific venue by name.
export const FALLBACK_BBOX_PADDING_DEGREES = 0.05;

export interface LocationBoundingBox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export interface LocationSuggestion {
  id: string;
  name: string;
  boundingBox: LocationBoundingBox;
  // Purely cosmetic — lets a combined suggestion dropdown (see LocationSearch.tsx)
  // badge a venue result differently from a Mapbox city/place result. Undefined for
  // every Mapbox result below; venues.ts sets it explicitly when converting a venue
  // into this same shape.
  kind?: "location" | "venue";
}

// Pads a small box around a single point so it behaves as an "arrival bbox" the same
// way Mapbox's own point-only results already do below (address/poi types never carry
// a `bbox`). `paddingDegrees` defaults to FALLBACK_BBOX_PADDING_DEGREES for that
// city/neighborhood-scale use — venues.ts passes its own much tighter value instead
// (see VENUE_BBOX_PADDING_DEGREES) rather than relying on this default, so this
// default itself stays exactly what location search has always used.
export function boundingBoxAroundPoint(
  lat: number,
  lng: number,
  paddingDegrees: number = FALLBACK_BBOX_PADDING_DEGREES
): LocationBoundingBox {
  return {
    minLng: lng - paddingDegrees,
    minLat: lat - paddingDegrees,
    maxLng: lng + paddingDegrees,
    maxLat: lat + paddingDegrees,
  };
}

interface MapboxFeature {
  id: string;
  place_name: string;
  center: [number, number];
  bbox?: [number, number, number, number];
}

interface MapboxGeocodeResponse {
  features?: MapboxFeature[];
}

export async function geocodeLocation(
  query: string,
  signal?: AbortSignal
): Promise<LocationSuggestion[]> {
  if (!MAPBOX_TOKEN) {
    throw new Error("NEXT_PUBLIC_MAPBOX_TOKEN is not configured");
  }

  const url = new URL(`${GEOCODE_URL}/${encodeURIComponent(query)}.json`);
  url.searchParams.set("access_token", MAPBOX_TOKEN);
  url.searchParams.set("autocomplete", "true");
  url.searchParams.set("limit", "5");
  url.searchParams.set("types", GEOCODE_TYPES);

  const res = await fetch(url.toString(), { signal });
  if (!res.ok) {
    throw new Error(`Mapbox geocoding request failed with status ${res.status}`);
  }

  const data: MapboxGeocodeResponse = await res.json();

  return (data.features ?? []).map((feature) => {
    const [lng, lat] = feature.center;
    return {
      id: feature.id,
      name: feature.place_name,
      boundingBox: feature.bbox
        ? { minLng: feature.bbox[0], minLat: feature.bbox[1], maxLng: feature.bbox[2], maxLat: feature.bbox[3] }
        : boundingBoxAroundPoint(lat, lng),
    };
  });
}
