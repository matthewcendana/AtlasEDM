"use client";

import { useEffect, useState } from "react";
import { MagnifyingGlass, X } from "@phosphor-icons/react/dist/ssr";
import { geocodeLocation, type LocationSuggestion } from "../_lib/mapbox";
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
    if (selected || debouncedQuery.trim().length < 2) {
      return;
    }

    const controller = new AbortController();
    geocodeLocation(debouncedQuery, controller.signal)
      .then((results) => {
        setSuggestions(results);
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Location search failed");
        setSuggestions([]);
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

      {isOpen && !selected && debouncedQuery.trim().length >= 2 && (suggestions.length > 0 || error) && (
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
