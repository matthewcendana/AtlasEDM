const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const GEOCODE_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places";

// Bias toward area-level results (city/region/country) since the result becomes a
// map bounding box, not a pin — a street address would be a strange thing to search here.
const GEOCODE_TYPES = "place,locality,neighborhood,district,region,country,postcode";

// Mapbox omits `bbox` for some area types (e.g. neighborhoods) and always omits it for
// point-only types; when that happens we pad a small box around the feature's center.
const FALLBACK_BBOX_PADDING_DEGREES = 0.05;

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
    const [minLng, minLat, maxLng, maxLat] =
      feature.bbox ??
      ([
        lng - FALLBACK_BBOX_PADDING_DEGREES,
        lat - FALLBACK_BBOX_PADDING_DEGREES,
        lng + FALLBACK_BBOX_PADDING_DEGREES,
        lat + FALLBACK_BBOX_PADDING_DEGREES,
      ] as [number, number, number, number]);

    return {
      id: feature.id,
      name: feature.place_name,
      boundingBox: { minLng, minLat, maxLng, maxLat },
    };
  });
}
