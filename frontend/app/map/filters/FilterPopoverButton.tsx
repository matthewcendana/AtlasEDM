"use client";

import { useEffect, useRef } from "react";
import type { IconWeight } from "@phosphor-icons/react";

interface FilterPopoverButtonProps {
  icon: React.ComponentType<{ size?: number; weight?: IconWeight; className?: string }>;
  label: string;
  isOpen: boolean;
  isActive: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: React.ReactNode;
  // Which side the dropdown hangs from below the trigger. Defaults to the trigger's
  // own left edge (Google Maps-style filter chips read left to right, so a dropdown
  // opening further right and downward reads naturally); the rightmost chip in the
  // row aligns its dropdown to the right edge instead so it doesn't run off-screen.
  align?: "left" | "right";
}

// Shared chrome for the horizontal row of filter chips: a pill trigger button
// (pink-accent when its filter is contributing to the current results) plus a
// dropdown panel that opens directly below it, matching the Google Maps filter-bar
// interaction model (click a chip, a dropdown appears under it). Outside-click/Escape
// closes it, mirroring native <select> behavior so the dropdowns don't feel like a
// bespoke trap.
//
// Deliberately no `overflow-hidden` on the dropdown panel — an earlier version had
// it, which silently clipped any child content taller than the panel's own
// auto-sized height (e.g. an absolutely-positioned autocomplete list growing below
// its input). Rounded corners don't need overflow clipping to render correctly here,
// since every child already respects the panel's padding.
export function FilterPopoverButton({
  icon: Icon,
  label,
  isOpen,
  isActive,
  onToggle,
  onClose,
  children,
  align = "left",
}: FilterPopoverButtonProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className={`flex items-center gap-2 rounded-full py-2.5 pl-4 pr-5 text-sm font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.12)] transition-colors ${
          isActive
            ? "bg-accent text-white"
            : "bg-white text-zinc-700 hover:bg-panel-light"
        }`}
      >
        <Icon size={18} weight={isActive ? "fill" : "regular"} />
        {label}
      </button>

      {isOpen && (
        <div
          className={`absolute top-full z-10 mt-2 w-72 rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_rgba(0,0,0,0.18)] ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
