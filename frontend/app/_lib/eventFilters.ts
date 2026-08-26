import type { LocationSuggestion } from "./mapbox";
import type { ArtistSuggestion } from "./artists";

// The shape a future GET /events call will be made with. Field names match the
// backend's query params directly (see EventController.cc) so building the request
// later is a straight pass-through.
export interface EventQueryFilters {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
  artistIds: number[];
}

export function buildEventQueryFilters(
  location: LocationSuggestion,
  artists: ArtistSuggestion[]
): EventQueryFilters {
  return {
    minLat: location.boundingBox.minLat,
    minLng: location.boundingBox.minLng,
    maxLat: location.boundingBox.maxLat,
    maxLng: location.boundingBox.maxLng,
    artistIds: artists.map((artist) => artist.id),
  };
}

// Carries the search bar's resolved selection to /map as URL query params — plain
// GET params so a direct link/refresh round-trips the same search, and so /map can
// tell "arrived from a search" apart from "landed here directly" (see
// parseMapSearchParams' null return).
export function buildMapSearchParams(
  location: LocationSuggestion,
  artists: ArtistSuggestion[]
): URLSearchParams {
  const filters = buildEventQueryFilters(location, artists);
  const params = new URLSearchParams();
  params.set("minLat", String(filters.minLat));
  params.set("minLng", String(filters.minLng));
  params.set("maxLat", String(filters.maxLat));
  params.set("maxLng", String(filters.maxLng));
  if (filters.artistIds.length > 0) {
    params.set("artistIds", filters.artistIds.join(","));
    // Carried alongside artistIds (same order, repeated key) purely so /map can
    // pre-populate the on-map artist filter's chips with real names instead of
    // just ids — there's no "look up artist by id" endpoint to resolve this after
    // the fact. Frontend-only param; the backend ignores it.
    for (const artist of artists) {
      params.append("artistName", artist.name);
    }
  }
  params.set("locationName", location.name);
  return params;
}

export interface MapSearchParams {
  filters: EventQueryFilters;
  locationName: string;
  artists: ArtistSuggestion[];
}

// Returns null when the bbox params are missing/malformed — the signal /map uses to
// fall back to a default view instead of attempting a broken transition (e.g. a
// direct visit or a page refresh with no search behind it).
export function parseMapSearchParams(searchParams: URLSearchParams): MapSearchParams | null {
  const minLatRaw = searchParams.get("minLat");
  const minLngRaw = searchParams.get("minLng");
  const maxLatRaw = searchParams.get("maxLat");
  const maxLngRaw = searchParams.get("maxLng");
  // Number(null) coerces to 0 rather than NaN, so a missing param has to be checked
  // for explicitly — otherwise a plain /map visit with no query string would silently
  // parse as a valid (0,0)-(0,0) bbox instead of falling back to the default view.
  if (minLatRaw === null || minLngRaw === null || maxLatRaw === null || maxLngRaw === null) {
    return null;
  }

  const minLat = Number(minLatRaw);
  const minLng = Number(minLngRaw);
  const maxLat = Number(maxLatRaw);
  const maxLng = Number(maxLngRaw);
  if ([minLat, minLng, maxLat, maxLng].some((n) => !Number.isFinite(n))) {
    return null;
  }

  const artistIdsRaw = searchParams.get("artistIds");
  const artistIds = artistIdsRaw
    ? artistIdsRaw
        .split(",")
        .map(Number)
        .filter((n) => Number.isFinite(n))
    : [];
  // artistName entries are appended in the same order as artistIds (see
  // buildMapSearchParams) — zipped back together here. A mismatched count (e.g. a
  // hand-edited URL) falls back to a placeholder label rather than dropping the id.
  const artistNames = searchParams.getAll("artistName");
  const artists: ArtistSuggestion[] = artistIds.map((id, i) => ({
    id,
    edmtrainId: 0,
    name: artistNames[i] ?? `Artist ${id}`,
  }));

  return {
    filters: { minLat, minLng, maxLat, maxLng, artistIds },
    locationName: searchParams.get("locationName") ?? "the selected area",
    artists,
  };
}
