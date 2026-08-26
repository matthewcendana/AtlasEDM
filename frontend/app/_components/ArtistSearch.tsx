"use client";

import { useEffect, useState } from "react";
import { X } from "@phosphor-icons/react/dist/ssr";
import { MIN_ARTIST_QUERY_LENGTH, searchArtists, type ArtistSuggestion } from "../_lib/artists";
import { useDebouncedValue } from "../_lib/useDebouncedValue";
import { LoadingSpinner } from "./LoadingSpinner";

interface ArtistSearchProps {
  selected: ArtistSuggestion[];
  onChange: (artists: ArtistSuggestion[]) => void;
}

const MAX_ARTISTS = 5;

export function ArtistSearch({ selected, onChange }: ArtistSearchProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<ArtistSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 300);
  const atMax = selected.length >= MAX_ARTISTS;

  useEffect(() => {
    if (atMax || debouncedQuery.trim().length < MIN_ARTIST_QUERY_LENGTH) {
      // No explicit setIsLoading(false) here: either nothing was ever loading (the
      // initial-state default already covers it), or a previous in-flight request
      // is being aborted by this same re-run's cleanup, whose own `.finally` below
      // clears it once the abort actually lands — not synchronously here.
      return;
    }

    const controller = new AbortController();
    // This is the exact "fetch on a dependency change" shape React's own docs use
    // (react.dev/learn/you-might-not-need-an-effect#fetching-data) — flip the flag
    // synchronously, then resolve it from the fetch's own then/catch/finally. The
    // lint rule's blanket "no setState synchronously in an effect body" heuristic
    // doesn't have a carve-out for that established pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    searchArtists(debouncedQuery, controller.signal)
      .then((results) => {
        const selectedIds = new Set(selected.map((artist) => artist.id));
        setSuggestions(results.filter((artist) => !selectedIds.has(artist.id)));
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Artist search failed");
        setSuggestions([]);
      })
      .finally(() => {
        setIsLoading(false);
      });

    return () => controller.abort();
  }, [debouncedQuery, selected, atMax]);

  function handleSelect(artist: ArtistSuggestion) {
    onChange([...selected, artist]);
    setQuery("");
    setSuggestions([]);
  }

  function handleRemove(artistId: number) {
    onChange(selected.filter((artist) => artist.id !== artistId));
  }

  return (
    <div className="w-full max-w-md">
      <label htmlFor="artist-search" className="sr-only">
        Artists
      </label>

      {selected.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {selected.map((artist) => (
            <li
              key={artist.id}
              className="flex items-center gap-1 rounded-full bg-white py-1.5 pl-3 pr-2 text-sm text-zinc-700 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
            >
              {artist.name}
              <button
                type="button"
                aria-label={`Remove ${artist.name}`}
                onClick={() => handleRemove(artist.id)}
                className="text-zinc-400 hover:text-zinc-900"
              >
                <X size={14} weight="bold" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <input
          id="artist-search"
          type="text"
          placeholder={atMax ? `Up to ${MAX_ARTISTS} artists` : "Search artists (optional)"}
          value={query}
          disabled={atMax}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 150)}
          className="w-full rounded-full bg-white py-3 pl-6 pr-6 text-sm text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)] outline-none placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-zinc-900/10 disabled:opacity-60"
        />

        {isOpen &&
          !atMax &&
          debouncedQuery.trim().length >= MIN_ARTIST_QUERY_LENGTH &&
          (isLoading || suggestions.length > 0 || error) && (
          <ul className="absolute z-10 mt-2 w-full overflow-hidden rounded-2xl bg-white py-2 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.08)]">
            {isLoading && (
              <li className="flex items-center gap-2 px-6 py-2 text-sm text-zinc-400">
                <LoadingSpinner size={14} />
                Searching…
              </li>
            )}
            {!isLoading && error && <li className="px-6 py-2 text-sm text-red-500">{error}</li>}
            {!isLoading && suggestions.map((artist) => (
              <li key={artist.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(artist)}
                  className="w-full px-6 py-2 text-left text-sm text-zinc-700 hover:bg-panel-light"
                >
                  {artist.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
