"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LocationSearch } from "./LocationSearch";
import type { LocationSuggestion } from "../_lib/mapbox";
import { buildMapSearchParams } from "../_lib/eventFilters";
import { markMapClientNavigation } from "../_lib/mapNavigation";

// Artist selection isn't offered on the landing page's search UI - only location/
// venue search is. It's still fully supported once on /map, via the on-map filter
// bar's own Artist chip. buildMapSearchParams still takes an artists array (shared
// with that on-map flow), so this passes an empty one rather than dropping the
// param entirely.
const NO_ARTISTS: never[] = [];

export function SearchBar() {
  const router = useRouter();
  const [location, setLocation] = useState<LocationSuggestion | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!location) return;

    const params = buildMapSearchParams(location, NO_ARTISTS);
    markMapClientNavigation();
    router.push(`/map?${params.toString()}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <LocationSearch selected={location} onSelect={setLocation} />

      <button
        type="submit"
        disabled={!location}
        className="w-fit rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      >
        Search
      </button>
    </form>
  );
}
