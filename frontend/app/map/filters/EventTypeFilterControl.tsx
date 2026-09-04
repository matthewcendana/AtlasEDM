"use client";

import { Check, Ticket } from "@phosphor-icons/react/dist/ssr";
import { ALL_EVENT_TYPES } from "../../_lib/mapFilters";
import type { EventType } from "../../_lib/events";
import { FilterPopoverButton } from "./FilterPopoverButton";

const OPTIONS: { value: EventType; label: string }[] = [
  { value: "festival", label: "Festival" },
  { value: "single", label: "Single Artist" },
];

interface EventTypeFilterControlProps {
  eventTypes: EventType[];
  onChange: (eventTypes: EventType[]) => void;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

// Checkboxes mapped directly onto events.festival_ind. Unlike AgeFilterControl,
// unchecking the last remaining box is allowed here rather than disallowed — an
// empty selection is treated server-side (and in mapFiltersToEventParams) exactly
// the same as both boxes checked, i.e. no filter, so there's no "match nothing"
// state to guard against.
export function EventTypeFilterControl({
  eventTypes,
  onChange,
  isOpen,
  onToggle,
  onClose,
}: EventTypeFilterControlProps) {
  const isActive = eventTypes.length !== ALL_EVENT_TYPES.length;
  const label = isActive ? `Event type · ${eventTypes.length}` : "Event type";

  function toggle(value: EventType) {
    const isChecked = eventTypes.includes(value);
    onChange(isChecked ? eventTypes.filter((type) => type !== value) : [...eventTypes, value]);
  }

  return (
    <FilterPopoverButton
      icon={Ticket}
      label={label}
      isOpen={isOpen}
      isActive={isActive}
      onToggle={onToggle}
      onClose={onClose}
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        Event type
      </p>
      <div className="flex flex-col gap-1.5">
        {OPTIONS.map((option) => {
          const isChecked = eventTypes.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              role="checkbox"
              aria-checked={isChecked}
              onClick={() => toggle(option.value)}
              className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-left text-sm font-semibold transition-colors ${
                isChecked ? "bg-panel-light text-zinc-950" : "text-zinc-400 hover:bg-panel-light"
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
                  isChecked ? "border-accent bg-accent" : "border-zinc-300"
                }`}
              >
                {isChecked && <Check size={12} weight="bold" className="text-white" />}
              </span>
              {option.label}
            </button>
          );
        })}
      </div>
    </FilterPopoverButton>
  );
}
