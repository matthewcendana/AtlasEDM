"use client";

import { MusicNotes } from "@phosphor-icons/react/dist/ssr";
import { ArtistSearch } from "../../_components/ArtistSearch";
import type { ArtistSuggestion } from "../../_lib/artists";
import { FilterPopoverButton } from "./FilterPopoverButton";

interface ArtistFilterControlProps {
  artists: ArtistSuggestion[];
  onChange: (artists: ArtistSuggestion[]) => void;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

export function ArtistFilterControl({
  artists,
  onChange,
  isOpen,
  onToggle,
  onClose,
}: ArtistFilterControlProps) {
  const label = artists.length > 0 ? `Artists · ${artists.length}` : "Artists";

  return (
    <FilterPopoverButton
      icon={MusicNotes}
      label={label}
      isOpen={isOpen}
      isActive={artists.length > 0}
      onToggle={onToggle}
      onClose={onClose}
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
        Filter by artist
      </p>
      <ArtistSearch selected={artists} onChange={onChange} />
    </FilterPopoverButton>
  );
}
