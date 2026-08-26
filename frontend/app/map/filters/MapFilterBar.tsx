"use client";

import { useState } from "react";
import { ArrowCounterClockwise } from "@phosphor-icons/react/dist/ssr";
import type { ArtistSuggestion } from "../../_lib/artists";
import type { AgeCategory } from "../../_lib/events";
import { EMPTY_MAP_FILTERS, hasActiveMapFilters, type MapFilterState } from "../../_lib/mapFilters";
import { ArtistFilterControl } from "./ArtistFilterControl";
import { EventCountControl } from "./EventCountControl";
import { DateRangeControl } from "./DateRangeControl";
import { AgeFilterControl } from "./AgeFilterControl";

type FilterId = "artists" | "eventsPerVenue" | "dateRange" | "age";

interface MapFilterBarProps {
  filters: MapFilterState;
  onChange: (filters: MapFilterState) => void;
  maxEventsPerVenue: number;
}

// A horizontal row of filter chips, each opening a dropdown directly below itself —
// the Google Maps filter-bar interaction model (not its visual style). Left to right:
// Artists, Events/venue, Date range, Age.
export function MapFilterBar({ filters, onChange, maxEventsPerVenue }: MapFilterBarProps) {
  const [openFilter, setOpenFilter] = useState<FilterId | null>(null);
  const isActive = hasActiveMapFilters(filters);

  function toggle(id: FilterId) {
    setOpenFilter((current) => (current === id ? null : id));
  }

  function setArtists(artists: ArtistSuggestion[]) {
    onChange({ ...filters, artists });
  }
  function setEventsPerVenue(eventsPerVenue: number | null) {
    onChange({ ...filters, eventsPerVenue });
  }
  function setDateRange(startDate: string | null, endDate: string | null) {
    onChange({ ...filters, startDate, endDate });
  }
  function setAgeCategories(ageCategories: AgeCategory[]) {
    onChange({ ...filters, ageCategories });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ArtistFilterControl
        artists={filters.artists}
        onChange={setArtists}
        isOpen={openFilter === "artists"}
        onToggle={() => toggle("artists")}
        onClose={() => setOpenFilter(null)}
      />
      <EventCountControl
        eventsPerVenue={filters.eventsPerVenue}
        max={maxEventsPerVenue}
        onChange={setEventsPerVenue}
        isOpen={openFilter === "eventsPerVenue"}
        onToggle={() => toggle("eventsPerVenue")}
        onClose={() => setOpenFilter(null)}
      />
      <DateRangeControl
        startDate={filters.startDate}
        endDate={filters.endDate}
        onChange={setDateRange}
        isOpen={openFilter === "dateRange"}
        onToggle={() => toggle("dateRange")}
        onClose={() => setOpenFilter(null)}
      />
      <AgeFilterControl
        ageCategories={filters.ageCategories}
        onChange={setAgeCategories}
        isOpen={openFilter === "age"}
        onToggle={() => toggle("age")}
        onClose={() => setOpenFilter(null)}
      />

      {isActive && (
        <button
          type="button"
          onClick={() => {
            setOpenFilter(null);
            onChange(EMPTY_MAP_FILTERS);
          }}
          className="flex items-center gap-1.5 rounded-full bg-zinc-950/80 px-4 py-2.5 text-xs font-semibold text-white backdrop-blur-sm transition-opacity hover:bg-zinc-950"
        >
          <ArrowCounterClockwise size={14} weight="bold" />
          Clear filters
        </button>
      )}
    </div>
  );
}
