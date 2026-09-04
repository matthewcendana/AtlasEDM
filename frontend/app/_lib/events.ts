const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8080";

// Wire tokens for the backend's `ageCategories` param — a direct multi-select (see
// EventController.cc's resolveAgeCategoryFilter), not a threshold. Deliberately
// digits/lowercase rather than the DB's literal "18+"/"21+"/"Other" values: a raw "+"
// in a query string is ambiguous with an encoded space under the
// application/x-www-form-urlencoded convention most HTTP stacks assume, so the wire
// format avoids the character entirely rather than relying on both ends' URL
// encoders/decoders agreeing on percent-escaping it.
export type AgeCategory = "18" | "21";

// Both buckets = the fully-inclusive/opt-out default (see mapFilters.ts and
// EventController.cc's resolveAgeCategoryFilter) — lives here, next to AgeCategory
// itself, so both mapFilters.ts and eventFilters.ts can import it without a cycle.
export const ALL_AGE_CATEGORIES: AgeCategory[] = ["18", "21"];

// Wire tokens for the backend's `eventTypes` param (see EventController.cc's
// resolveEventTypeFilter) — maps directly onto events.festival_ind (true/false).
export type EventType = "festival" | "single";

// Both buckets checked = the fully-inclusive/opt-out default, same convention as
// ALL_AGE_CATEGORIES above.
export const ALL_EVENT_TYPES: EventType[] = ["festival", "single"];

// Optional filters layered on top of a bounding box. Field names match the
// backend's query params directly (see EventController.cc) so building the
// request is a straight pass-through; every field is optional because an
// absent param means "don't filter on this" server-side.
export interface EventQueryParams {
  artistIds?: number[];
  eventsPerVenue?: number;
  startDate?: string;
  endDate?: string;
  ageCategories?: AgeCategory[];
  eventTypes?: EventType[];
  festivalsOnly?: boolean;
}

export interface VenueEvent {
  id: number;
  name: string;
  date: string;
  startTime: string;
  link: string;
  ages: string;
  isFlagship: boolean;
  festivalInd: boolean;
  artists: { name: string; b2bInd: boolean }[];
}

export interface Venue {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  totalEventCount: number;
  events: VenueEvent[];
}

interface EventsResponse {
  venues?: Venue[];
}

export interface EventsBoundingBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export async function fetchEvents(
  bbox: EventsBoundingBox,
  params: EventQueryParams = {}
): Promise<Venue[]> {
  const url = new URL("/events", BACKEND_URL);
  url.searchParams.set("minLat", String(bbox.minLat));
  url.searchParams.set("minLng", String(bbox.minLng));
  url.searchParams.set("maxLat", String(bbox.maxLat));
  url.searchParams.set("maxLng", String(bbox.maxLng));
  if (params.artistIds && params.artistIds.length > 0) {
    url.searchParams.set("artistIds", params.artistIds.join(","));
  }
  if (params.eventsPerVenue !== undefined) {
    url.searchParams.set("eventsPerVenue", String(params.eventsPerVenue));
  }
  if (params.ageCategories && params.ageCategories.length > 0) {
    url.searchParams.set("ageCategories", params.ageCategories.join(","));
  }
  if (params.eventTypes && params.eventTypes.length > 0) {
    url.searchParams.set("eventTypes", params.eventTypes.join(","));
  }
  if (params.startDate) url.searchParams.set("startDate", params.startDate);
  if (params.endDate) url.searchParams.set("endDate", params.endDate);
  if (params.festivalsOnly) {
    url.searchParams.set("festivalsOnly", "true");
    // festival dates are often booked out much further than the backend's default
    // 90-day window (e.g. a next year's Ultra Miami/Tomorrowland edition already on
    // the calendar) — widen it so those still show up on the homepage globe today,
    // unless an active date-range filter already narrowed the window on purpose.
    if (!params.startDate) url.searchParams.set("startDate", "2020-01-01");
    if (!params.endDate) url.searchParams.set("endDate", "2030-01-01");
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`GET /events failed with status ${res.status}`);
  }
  const data: EventsResponse = await res.json();
  return data.venues ?? [];
}

// Postgres's `geography` envelope cast misbehaves for very wide longitude spans —
// results start *shrinking* as the box widens past roughly ±130°, becoming a
// degenerate empty box near a full ±180° span (a ring-winding ambiguity: a "wide"
// planar rectangle cast to geography can be interpreted as the *narrow* arc the
// other way around the sphere). Confirmed empirically against the live backend
// rather than assumed. Tiling the world into three 120°-wide, non-overlapping
// bands — comfortably inside the range that behaves correctly — sidesteps it
// entirely instead of trying to special-case one giant query.
const WORLD_TILES: EventsBoundingBox[] = [
  { minLat: -85, minLng: -180, maxLat: 85, maxLng: -60 },
  { minLat: -85, minLng: -60, maxLat: 85, maxLng: 60 },
  { minLat: -85, minLng: 60, maxLat: 85, maxLng: 180 },
];

export async function fetchFlagshipEvents(params: EventQueryParams = {}): Promise<Venue[]> {
  const tileResults = await Promise.all(
    WORLD_TILES.map((tile) => fetchEvents(tile, { ...params, festivalsOnly: true }))
  );

  const byVenueId = new Map<number, Venue>();
  for (const venues of tileResults) {
    for (const venue of venues) {
      byVenueId.set(venue.id, venue);
    }
  }
  return [...byVenueId.values()];
}
