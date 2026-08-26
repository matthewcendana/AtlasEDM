"use client";

import { useState } from "react";
import { Stack } from "@phosphor-icons/react/dist/ssr";
import { FilterPopoverButton } from "./FilterPopoverButton";

const MIN_EVENTS_PER_VENUE = 0;

interface EventCountControlProps {
  eventsPerVenue: number | null;
  // Highest per-venue event count actually present in the current result set (see
  // MapView's updateMaxEventsPerVenue) — the slider's ceiling is real data, not a
  // guess, and moves as the user pans to denser or sparser areas.
  max: number;
  onChange: (eventsPerVenue: number | null) => void;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

export function EventCountControl({
  eventsPerVenue,
  max,
  onChange,
  isOpen,
  onToggle,
  onClose,
}: EventCountControlProps) {
  const isActive = eventsPerVenue !== null;
  const committedValue = eventsPerVenue ?? max;
  // Dragging updates this local value on every pointer move for immediate visual
  // feedback, without touching the real `filters` state — and therefore without
  // triggering the debounced refetch pipeline — until the drag actually ends.
  const [dragValue, setDragValue] = useState(committedValue);
  // Re-syncs dragValue whenever the committed value changes for a reason other than
  // this component's own drag (e.g. "Reset", or the max shifting after a pan) —
  // adjusted directly during render rather than in an effect, per React's own
  // guidance for "state that should reset when a prop changes": an extra render on
  // the same commit instead of a whole separate effect pass.
  const [prevCommittedValue, setPrevCommittedValue] = useState(committedValue);
  if (committedValue !== prevCommittedValue) {
    setPrevCommittedValue(committedValue);
    setDragValue(committedValue);
  }

  function commit() {
    onChange(dragValue);
  }

  return (
    <FilterPopoverButton
      icon={Stack}
      label={isActive ? `Events/venue · ${eventsPerVenue}` : "Events/venue"}
      isOpen={isOpen}
      isActive={isActive}
      onToggle={onToggle}
      onClose={onClose}
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        Events shown per venue
      </p>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={MIN_EVENTS_PER_VENUE}
          max={Math.max(max, MIN_EVENTS_PER_VENUE + 1)}
          value={dragValue}
          onChange={(e) => setDragValue(Number(e.target.value))}
          onMouseUp={commit}
          onTouchEnd={commit}
          onKeyUp={commit}
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-panel-light accent-accent"
        />
        <span className="w-6 shrink-0 text-right text-sm font-bold tabular-nums text-zinc-950">
          {dragValue}
        </span>
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-zinc-400">
        <span>{MIN_EVENTS_PER_VENUE}</span>
        <span>{max}</span>
      </div>
      {isActive && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="mt-3 text-xs font-semibold text-zinc-400 hover:text-zinc-700"
        >
          Reset to default
        </button>
      )}
    </FilterPopoverButton>
  );
}
