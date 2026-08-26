import type { ArtistSuggestion } from "./artists";
import type { AgeCategory, EventQueryParams } from "./events";
import type { MapSearchParams } from "./eventFilters";

export const ALL_AGE_CATEGORIES: AgeCategory[] = ["18", "21", "other"];

// Everything the on-map filter bar can control. Distinct from the one-time arrival
// bbox/artist selection carried in the URL (see eventFilters.ts) — this is the
// ongoing filter state that governs every fetch made while the user is on /map.
export interface MapFilterState {
  artists: ArtistSuggestion[];
  eventsPerVenue: number | null;
  startDate: string | null;
  endDate: string | null;
  // All three checked is the fully-inclusive/opt-out default (a query "starts"
  // showing every age bucket) — checking is equivalent to "no age filter", so this
  // is never empty: unchecking the last remaining box is disallowed in the UI
  // rather than represented as a valid empty-selection state here.
  ageCategories: AgeCategory[];
}

export const EMPTY_MAP_FILTERS: MapFilterState = {
  artists: [],
  eventsPerVenue: null,
  startDate: null,
  endDate: null,
  ageCategories: ALL_AGE_CATEGORIES,
};

// Seeds the on-map filter state from whatever the landing page's search sent along
// (currently just artists) — so arriving with an artist-filtered search shows those
// same artists as removable chips on the map, instead of the filter silently
// resetting the moment the user touches anything else.
export function initialMapFilters(arrival: MapSearchParams | null): MapFilterState {
  if (!arrival) return EMPTY_MAP_FILTERS;
  return { ...EMPTY_MAP_FILTERS, artists: arrival.artists };
}

export function hasActiveMapFilters(filters: MapFilterState): boolean {
  return (
    filters.artists.length > 0 ||
    filters.eventsPerVenue !== null ||
    filters.startDate !== null ||
    filters.endDate !== null ||
    filters.ageCategories.length < ALL_AGE_CATEGORIES.length
  );
}

export function mapFiltersToEventParams(filters: MapFilterState): EventQueryParams {
  return {
    artistIds: filters.artists.map((artist) => artist.id),
    eventsPerVenue: filters.eventsPerVenue ?? undefined,
    startDate: filters.startDate ?? undefined,
    endDate: filters.endDate ?? undefined,
    // Omitted entirely when every bucket is checked — identical to "no filter"
    // server-side, and keeps the fully-inclusive default from ever needing its own
    // request param, same as an untouched filter bar today.
    ageCategories:
      filters.ageCategories.length < ALL_AGE_CATEGORIES.length ? filters.ageCategories : undefined,
  };
}
