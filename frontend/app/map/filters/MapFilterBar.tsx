"use client";

import { useState } from "react";
import { ArrowCounterClockwise } from "@phosphor-icons/react/dist/ssr";
import type { ArtistSuggestion } from "../../_lib/artists";
import type { AgeCategory, EventType } from "../../_lib/events";
import { EMPTY_MAP_FILTERS, hasActiveMapFilters, type MapFilterState } from "../../_lib/mapFilters";
import { ArtistFilterControl } from "./ArtistFilterControl";
import { EventTypeFilterControl } from "./EventTypeFilterControl";
import { DateRangeControl } from "./DateRangeControl";
import { AgeFilterControl } from "./AgeFilterControl";

type FilterId = "artists" | "eventType" | "dateRange" | "age";

interface MapFilterBarProps {
  filters: MapFilterState;
  onChange: (filters: MapFilterState) => void;
}

// A horizontal row of filter chips, each opening a dropdown directly below itself —
// the Google Maps filter-bar interaction model (not its visual style). Left to right:
// Artists, Event type, Date range, Age.
export function MapFilterBar({ filters, onChange }: MapFilterBarProps) {
  const [openFilter, setOpenFilter] = useState<FilterId | null>(null);
  const isActive = hasActiveMapFilters(filters);

  function toggle(id: FilterId) {
    setOpenFilter((current) => (current === id ? null : id));
  }

  function setArtists(artists: ArtistSuggestion[]) {
    onChange({ ...filters, artists });
  }
  function setEventTypes(eventTypes: EventType[]) {
    onChange({ ...filters, eventTypes });
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
      <EventTypeFilterControl
        eventTypes={filters.eventTypes}
        onChange={setEventTypes}
        isOpen={openFilter === "eventType"}
        onToggle={() => toggle("eventType")}
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
          className="flex items-center gap-2 rounded-full bg-zinc-950/80 px-5 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-opacity hover:bg-zinc-950"
        >
          <ArrowCounterClockwise size={18} weight="bold" />
          Clear filters
        </button>
      )}
    </div>
  );
}
