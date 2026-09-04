"use client";

import { Check, IdentificationBadge } from "@phosphor-icons/react/dist/ssr";
import type { AgeCategory } from "../../_lib/events";
import { ALL_AGE_CATEGORIES } from "../../_lib/mapFilters";
import { FilterPopoverButton } from "./FilterPopoverButton";

const OPTIONS: { value: AgeCategory; label: string }[] = [
  { value: "18", label: "18+" },
  { value: "21", label: "21+" },
];

interface AgeFilterControlProps {
  ageCategories: AgeCategory[];
  onChange: (ageCategories: AgeCategory[]) => void;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

export function AgeFilterControl({
  ageCategories,
  onChange,
  isOpen,
  onToggle,
  onClose,
}: AgeFilterControlProps) {
  const isActive = ageCategories.length < ALL_AGE_CATEGORIES.length;
  const label = isActive ? `Age · ${ageCategories.length}` : "Age";

  function toggle(value: AgeCategory) {
    const isChecked = ageCategories.includes(value);
    if (isChecked) {
      // An empty selection has no sane server-side meaning (it isn't the same as
      // "no filter" — it would mean "match nothing"), so at least one bucket always
      // stays checked rather than letting the last one be unchecked.
      if (ageCategories.length === 1) return;
      onChange(ageCategories.filter((category) => category !== value));
    } else {
      onChange([...ageCategories, value]);
    }
  }

  return (
    <FilterPopoverButton
      icon={IdentificationBadge}
      label={label}
      isOpen={isOpen}
      isActive={isActive}
      onToggle={onToggle}
      onClose={onClose}
      align="right"
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        Age restriction
      </p>
      <div className="flex flex-col gap-1.5">
        {OPTIONS.map((option) => {
          const isChecked = ageCategories.includes(option.value);
          const isLastChecked = isChecked && ageCategories.length === 1;
          return (
            <button
              key={option.value}
              type="button"
              role="checkbox"
              aria-checked={isChecked}
              disabled={isLastChecked}
              onClick={() => toggle(option.value)}
              className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-left text-sm font-semibold transition-colors ${
                isChecked ? "bg-panel-light text-zinc-950" : "text-zinc-400 hover:bg-panel-light"
              } ${isLastChecked ? "cursor-not-allowed" : ""}`}
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
