"use client";

import { Check } from "@phosphor-icons/react/dist/ssr";

interface CheckboxListProps<T extends string> {
  heading: string;
  options: { value: T; label: string }[];
  selected: T[];
  onToggle: (value: T) => void;
  // When true, the last remaining checked box can't be unchecked (used by
  // AgeFilterControl, where an empty selection has no sane server-side meaning).
  // EventTypeFilterControl leaves this false - an empty selection there is treated
  // identically to everything checked, so there's nothing to guard against.
  disableLastUnchecked?: boolean;
}

// The checkbox-row list shared by AgeFilterControl and EventTypeFilterControl -
// previously two copies of the same markup (the second literally built by copying
// the first). Has no filter-specific knowledge: callers own what the options are,
// what selecting one means, and how `onToggle` updates their own state.
export function CheckboxList<T extends string>({
  heading,
  options,
  selected,
  onToggle,
  disableLastUnchecked = false,
}: CheckboxListProps<T>) {
  return (
    <>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">{heading}</p>
      <div className="flex flex-col gap-1.5">
        {options.map((option) => {
          const isChecked = selected.includes(option.value);
          const isLastChecked = disableLastUnchecked && isChecked && selected.length === 1;
          return (
            <button
              key={option.value}
              type="button"
              role="checkbox"
              aria-checked={isChecked}
              disabled={isLastChecked}
              onClick={() => onToggle(option.value)}
              className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-left text-sm font-semibold transition-colors ${
                isChecked ? "bg-surface-sunken text-text-primary" : "text-zinc-400 hover:bg-surface-sunken"
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
    </>
  );
}
