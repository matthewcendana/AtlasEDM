import type { ArtistSuggestion } from "./artists";
import { ALL_AGE_CATEGORIES, ALL_EVENT_TYPES, type AgeCategory, type EventQueryParams, type EventType } from "./events";
import type { MapSearchParams } from "./eventFilters";

export { ALL_AGE_CATEGORIES, ALL_EVENT_TYPES };

// Everything the on-map filter bar can control. Distinct from the one-time arrival
// bbox/artist selection carried in the URL (see eventFilters.ts) — this is the
// ongoing filter state that governs every fetch made while the user is on /map.
export interface MapFilterState {
  artists: ArtistSuggestion[];
  startDate: string | null;
  endDate: string | null;
  // Both checked is the fully-inclusive/opt-out default (a query "starts" showing
  // every age bucket) — checking is equivalent to "no age filter".
  ageCategories: AgeCategory[];
  // Both checked is likewise the fully-inclusive default. Unlike ageCategories,
  // unchecking every box here is allowed in the UI (see EventTypeFilterControl) —
  // it's treated identically to both-checked (no filter) rather than disallowed,
  // since "match nothing" has no sane empty-state to fall back to either way.
  eventTypes: EventType[];
}

export const EMPTY_MAP_FILTERS: MapFilterState = {
  artists: [],
  startDate: null,
  endDate: null,
  ageCategories: ALL_AGE_CATEGORIES,
  eventTypes: ALL_EVENT_TYPES,
};

// Seeds the on-map filter state from whatever search sent along — the landing
// page's search (artists only) or an on-map re-search via MapLocationSearch, which
// carries the full filter set forward (see buildMapSearchParams) — so arriving with
// a filtered search shows that same filter state on the map, instead of it silently
// resetting the moment the user searches a new location or touches anything else.
export function initialMapFilters(arrival: MapSearchParams | null): MapFilterState {
  if (!arrival) return EMPTY_MAP_FILTERS;
  return {
    artists: arrival.artists,
    startDate: arrival.startDate,
    endDate: arrival.endDate,
    ageCategories: arrival.ageCategories,
    eventTypes: arrival.eventTypes,
  };
}

export function hasActiveMapFilters(filters: MapFilterState): boolean {
  return (
    filters.artists.length > 0 ||
    filters.startDate !== null ||
    filters.endDate !== null ||
    filters.ageCategories.length < ALL_AGE_CATEGORIES.length ||
    filters.eventTypes.length !== ALL_EVENT_TYPES.length
  );
}

export function mapFiltersToEventParams(filters: MapFilterState): EventQueryParams {
  return {
    artistIds: filters.artists.map((artist) => artist.id),
    startDate: filters.startDate ?? undefined,
    endDate: filters.endDate ?? undefined,
    // Omitted entirely when every bucket is checked — identical to "no filter"
    // server-side, and keeps the fully-inclusive default from ever needing its own
    // request param, same as an untouched filter bar today.
    ageCategories:
      filters.ageCategories.length < ALL_AGE_CATEGORIES.length ? filters.ageCategories : undefined,
    // Same omit-when-full convention as ageCategories above. When neither box is
    // checked this sends an empty array, which fetchEvents' own length check (see
    // events.ts) also skips putting on the wire — so "neither checked" and "both
    // checked" end up indistinguishable to the backend, both meaning "no filter".
    eventTypes: filters.eventTypes.length < ALL_EVENT_TYPES.length ? filters.eventTypes : undefined,
  };
}
