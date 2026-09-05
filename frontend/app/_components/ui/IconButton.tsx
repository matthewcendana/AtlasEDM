"use client";

import { X } from "@phosphor-icons/react/dist/ssr";
import type { IconWeight } from "@phosphor-icons/react";

interface IconButtonProps {
  label: string;
  onClick: () => void;
  icon?: React.ComponentType<{ size?: number; weight?: IconWeight; className?: string }>;
  size?: number;
  // Extra classes for caller-specific positioning (e.g. absolute placement inside a
  // search input) - the button's own color/hover treatment is fixed below so every
  // icon button in the app looks and behaves the same regardless of where it sits.
  className?: string;
}

// The small icon-only "X to close/clear/remove" button repeated across
// VenueDetailPanel, FestivalPopupCard, LocationSearch, and ArtistSearch - same
// color/hover treatment everywhere, only the icon size and click target differ.
export function IconButton({ label, onClick, icon: Icon = X, size = 20, className = "" }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`shrink-0 text-zinc-400 transition-colors hover:text-text-primary ${className}`}
    >
      <Icon size={size} weight="bold" />
    </button>
  );
}
