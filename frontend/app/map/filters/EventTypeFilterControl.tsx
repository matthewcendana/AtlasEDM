"use client";

import { Ticket } from "@phosphor-icons/react/dist/ssr";
import { ALL_EVENT_TYPES } from "../../_lib/mapFilters";
import type { EventType } from "../../_lib/events";
import { FilterPopoverButton } from "./FilterPopoverButton";
import { CheckboxList } from "../../_components/ui/CheckboxList";

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
      <CheckboxList heading="Event type" options={OPTIONS} selected={eventTypes} onToggle={toggle} />
    </FilterPopoverButton>
  );
}
