import { boundingBoxAroundPoint, type LocationSuggestion } from "./mapbox";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8080";

// Mirrors the backend's own minimum (see kMinQueryLength in VenueController.cc) so we
// can skip the request entirely instead of firing it and getting a 400 back.
export const MIN_VENUE_QUERY_LENGTH = 2;

export interface VenueSuggestion {
  id: number;
  name: string;
  city: string | null;
  state: string | null;
  latitude: number;
  longitude: number;
}

interface VenueSearchResponseVenue {
  id: number;
  name: string;
  city: string | null;
  state: string | null;
  latitude: number;
  longitude: number;
}

interface VenueSearchResponse {
  venues?: VenueSearchResponseVenue[];
}

export async function searchVenues(query: string, signal?: AbortSignal): Promise<VenueSuggestion[]> {
  const url = new URL("/venues/search", BACKEND_URL);
  url.searchParams.set("query", query);

  const res = await fetch(url.toString(), { signal });
  if (!res.ok) {
    throw new Error(`Venue search request failed with status ${res.status}`);
  }

  const data: VenueSearchResponse = await res.json();

  return (data.venues ?? []).map((venue) => ({
    id: venue.id,
    name: venue.name,
    city: venue.city,
    state: venue.state,
    latitude: venue.latitude,
    longitude: venue.longitude,
  }));
}

// A venue is a landmark-scale point, not an area — using mapbox.ts's own
// FALLBACK_BBOX_PADDING_DEGREES (city/neighborhood-scale, ~0.05°) landed a venue
// arrival zoomed out far enough that other nearby venues' pins were already visible
// on arrival, defeating the point of searching a specific venue by name (e.g. NOS
// Events Center and the "San Bernardino" venue are only ~0.017° apart, well inside
// that box). 0.004° (~400-450m radius at most latitudes) comfortably isolates a
// venue from real-world neighbors like that one while still framing enough of its
// immediate surroundings to be legible, and still leaves the existing zoom-out floor
// (lockZoomFloorToCurrentPosition in MapView.tsx) to reveal the rest of the city's
// pins once the user actually zooms out — this only tightens the arrival bbox itself.
const VENUE_BBOX_PADDING_DEGREES = 0.004;

// Converts a venue into the exact same shape a Mapbox location result already takes
// (see mapbox.ts) — a venue arrival is then indistinguishable from a location arrival
// by the time it reaches buildMapSearchParams/MapView, so it flies in, locks its own
// zoom floor, etc. through the exact same path a city search already uses, no separate
// "venue arrival" logic anywhere.
export function venueToLocationSuggestion(venue: VenueSuggestion): LocationSuggestion {
  return {
    id: `venue-${venue.id}`,
    name: venue.name,
    boundingBox: boundingBoxAroundPoint(venue.latitude, venue.longitude, VENUE_BBOX_PADDING_DEGREES),
    kind: "venue",
  };
}
