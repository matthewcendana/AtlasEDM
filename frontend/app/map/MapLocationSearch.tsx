"use client";

import { useRouter } from "next/navigation";
import { LocationSearch } from "../_components/LocationSearch";
import type { LocationSuggestion } from "../_lib/mapbox";
import type { ArtistSuggestion } from "../_lib/artists";
import { buildMapSearchParams } from "../_lib/eventFilters";

interface MapLocationSearchProps {
  artists: ArtistSuggestion[];
}

// Lets the user search a new location without leaving /map. Reuses the exact
// LocationSearch component and buildMapSearchParams helper the landing page uses —
// selecting a suggestion pushes the same kind of `/map?minLat=...` URL, which
// MapView already treats as a fresh "arrival" (globe start + flyTo), so the
// transition is identical without duplicating any of that logic here.
export function MapLocationSearch({ artists }: MapLocationSearchProps) {
  const router = useRouter();

  function handleSelect(location: LocationSuggestion | null) {
    if (!location) return;
    const params = buildMapSearchParams(location, artists);
    router.push(`/map?${params.toString()}`);
  }

  return (
    <div className="w-full max-w-sm">
      <LocationSearch selected={null} onSelect={handleSelect} />
    </div>
  );
}
