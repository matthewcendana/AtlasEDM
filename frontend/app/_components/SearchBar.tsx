"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LocationSearch } from "./LocationSearch";
import { ArtistSearch } from "./ArtistSearch";
import type { LocationSuggestion } from "../_lib/mapbox";
import type { ArtistSuggestion } from "../_lib/artists";
import { buildMapSearchParams } from "../_lib/eventFilters";
import { markMapClientNavigation } from "../_lib/mapNavigation";

export function SearchBar() {
  const router = useRouter();
  const [location, setLocation] = useState<LocationSuggestion | null>(null);
  const [artists, setArtists] = useState<ArtistSuggestion[]>([]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!location) return;

    const params = buildMapSearchParams(location, artists);
    markMapClientNavigation();
    router.push(`/map?${params.toString()}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <LocationSearch selected={location} onSelect={setLocation} />
      <ArtistSearch selected={artists} onChange={setArtists} />

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
