"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LocationSearch } from "../_components/LocationSearch";
import type { LocationSuggestion } from "../_lib/mapbox";
import { buildMapSearchParams, type MapSearchParams } from "../_lib/eventFilters";
import type { MapFilterState } from "../_lib/mapFilters";
import { markMapClientNavigation } from "../_lib/mapNavigation";

interface MapLocationSearchProps {
  // The location this map instance actually arrived at (null for a direct /map
  // visit) — used to show that location as "selected" in this box, rather than
  // resetting to the empty placeholder the moment the user lands, panning, or
  // opens an on-map filter.
  arrival: MapSearchParams | null;
  // The full current on-map filter state — carried into a new search's URL (see
  // handleSelect) so replacing the location doesn't silently drop a date range,
  // age selection, or event-count cap the user had already set.
  filters: MapFilterState;
}

// Lets the user search a new location without leaving /map. Reuses the exact
// LocationSearch component and buildMapSearchParams helper the landing page uses —
// selecting a suggestion pushes the same kind of `/map?minLat=...` URL, which
// MapView already treats as a fresh "arrival" (globe start + flyTo), so the
// transition is identical without duplicating any of that logic here.
export function MapLocationSearch({ arrival, filters }: MapLocationSearchProps) {
  const router = useRouter();
  // Local-only "the user clicked X and hasn't picked a new suggestion yet" state.
  // Deliberately NOT a navigation: routing to a bbox-less /map would drop through
  // MapView's arrival=null path, which resets every on-map filter (see
  // initialMapFilters) — exactly the "filters get wiped by a location re-search"
  // bug this is fixing. Clearing should only reopen the field for typing; the real
  // location/filter state doesn't change until handleSelect gets an actual pick.
  const [isEditing, setIsEditing] = useState(false);

  // Reconstructed from the arrival's own bbox/name rather than tracked separately —
  // this is exactly the location this map instance is centered around, for as long
  // as the instance lives (a fresh arrival remounts MapView entirely, per its own
  // key), so it stays "selected" through panning, zooming, and filter changes.
  const selected: LocationSuggestion | null =
    !isEditing && arrival
      ? {
          id: arrival.locationName,
          name: arrival.locationName,
          boundingBox: {
            minLat: arrival.filters.minLat,
            minLng: arrival.filters.minLng,
            maxLat: arrival.filters.maxLat,
            maxLng: arrival.filters.maxLng,
          },
        }
      : null;

  function handleSelect(location: LocationSuggestion | null) {
    if (!location) {
      setIsEditing(true);
      return;
    }
    const params = buildMapSearchParams(location, filters.artists, {
      startDate: filters.startDate,
      endDate: filters.endDate,
      ageCategories: filters.ageCategories,
      eventTypes: filters.eventTypes,
    });
    markMapClientNavigation();
    router.push(`/map?${params.toString()}`);
  }

  return (
    <div className="w-full max-w-sm">
      <LocationSearch selected={selected} onSelect={handleSelect} />
    </div>
  );
}
