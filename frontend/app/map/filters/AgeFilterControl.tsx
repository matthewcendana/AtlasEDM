"use client";

import { IdentificationBadge } from "@phosphor-icons/react/dist/ssr";
import type { AgeCategory } from "../../_lib/events";
import { ALL_AGE_CATEGORIES } from "../../_lib/mapFilters";
import { FilterPopoverButton } from "./FilterPopoverButton";
import { CheckboxList } from "../../_components/ui/CheckboxList";

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
    onChange(
      isChecked ? ageCategories.filter((category) => category !== value) : [...ageCategories, value]
    );
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
      <CheckboxList
        heading="Age restriction"
        options={OPTIONS}
        selected={ageCategories}
        onToggle={toggle}
        disableLastUnchecked
      />
    </FilterPopoverButton>
  );
}
