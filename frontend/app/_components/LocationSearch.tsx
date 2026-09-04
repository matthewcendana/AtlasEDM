"use client";

import { useEffect, useState } from "react";
import { MagnifyingGlass, X } from "@phosphor-icons/react/dist/ssr";
import { geocodeLocation, type LocationSuggestion } from "../_lib/mapbox";
import { MIN_VENUE_QUERY_LENGTH, searchVenues, venueToLocationSuggestion } from "../_lib/venues";
import { useDebouncedValue } from "../_lib/useDebouncedValue";

interface LocationSearchProps {
  selected: LocationSuggestion | null;
  onSelect: (location: LocationSuggestion | null) => void;
}

export function LocationSearch({ selected, onSelect }: LocationSearchProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debouncedQuery = useDebouncedValue(query, 300);

  useEffect(() => {
    if (selected || debouncedQuery.trim().length < MIN_VENUE_QUERY_LENGTH) {
      return;
    }

    const controller = new AbortController();
    // Locations and venues are two independent sources feeding one combined dropdown
    // (see the suggestion list below) — allSettled rather than all so one source
    // failing (e.g. Mapbox rate-limited) doesn't wipe out results that already came
    // back from the other; an error only surfaces when *both* fail.
    Promise.allSettled([
      geocodeLocation(debouncedQuery, controller.signal),
      searchVenues(debouncedQuery, controller.signal),
    ]).then(([locationResult, venueResult]) => {
      if (controller.signal.aborted) return;

      const locations = locationResult.status === "fulfilled" ? locationResult.value : [];
      const venues =
        venueResult.status === "fulfilled" ? venueResult.value.map(venueToLocationSuggestion) : [];
      setSuggestions([...locations, ...venues]);

      if (locationResult.status === "rejected" && venueResult.status === "rejected") {
        const err = locationResult.reason;
        setError(err instanceof Error ? err.message : "Search failed");
      } else {
        setError(null);
      }
    });

    return () => controller.abort();
  }, [debouncedQuery, selected]);

  function handleSelect(location: LocationSuggestion) {
    onSelect(location);
    setQuery("");
    setSuggestions([]);
    setIsOpen(false);
  }

  function handleClear() {
    onSelect(null);
    setQuery("");
    setSuggestions([]);
  }

  return (
    <div className="relative w-full max-w-md">
      <label htmlFor="location-search" className="sr-only">
        Location
      </label>
      <div className="relative">
        <input
          id="location-search"
          type="text"
          placeholder="Select a location to begin"
          value={selected ? selected.name : query}
          readOnly={Boolean(selected)}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 150)}
          className="w-full rounded-full bg-white py-4 pl-6 pr-14 text-base text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)] outline-none placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-zinc-900/10"
        />
        {selected ? (
          <button
            type="button"
            aria-label="Clear location"
            onClick={handleClear}
            className="absolute right-5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-900"
          >
            <X size={20} weight="bold" />
          </button>
        ) : (
          <MagnifyingGlass
            className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-zinc-500"
            size={20}
            weight="bold"
          />
        )}
      </div>

      {isOpen && !selected && debouncedQuery.trim().length >= MIN_VENUE_QUERY_LENGTH && (suggestions.length > 0 || error) && (
        <ul className="absolute z-10 mt-2 w-full overflow-hidden rounded-2xl bg-white py-2 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.08)]">
          {error && <li className="px-6 py-2 text-sm text-red-500">{error}</li>}
          {suggestions.map((suggestion) => (
            <li key={suggestion.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(suggestion)}
                className="w-full px-6 py-2 text-left text-sm text-zinc-700 hover:bg-panel-light"
              >
                {suggestion.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
