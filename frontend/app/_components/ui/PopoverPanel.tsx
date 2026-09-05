"use client";

import { useEffect, useRef } from "react";
import type { IconWeight } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

interface PopoverPanelProps {
  icon: React.ComponentType<{ size?: number; weight?: IconWeight; className?: string }>;
  label: string;
  isOpen: boolean;
  isActive: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: React.ReactNode;
  // Which side the dropdown hangs from below the trigger. Defaults to the trigger's
  // own left edge (Google Maps-style filter chips read left to right, so a dropdown
  // opening further right and downward reads naturally); the rightmost chip in a row
  // aligns its dropdown to the right edge instead so it doesn't run off-screen.
  align?: "left" | "right";
}

// Shared chrome for a trigger pill (pink-accent when active) plus a dropdown panel
// that opens directly below it, matching the Google Maps filter-bar interaction
// model. Outside-click/Escape closes it, mirroring native <select> behavior.
// Originally built as the map filter bar's own FilterPopoverButton - lifted here
// unchanged since it was already fully generic (no filter-specific logic), just
// named for its first caller. FilterPopoverButton is now a thin re-export of this.
//
// Deliberately no `overflow-hidden` on the dropdown panel - an earlier version had
// it, which silently clipped any child content taller than the panel's own
// auto-sized height (e.g. an absolutely-positioned autocomplete list growing below
// its input). Rounded corners don't need overflow clipping to render correctly here,
// since every child already respects the panel's padding.
export function PopoverPanel({
  icon: Icon,
  label,
  isOpen,
  isActive,
  onToggle,
  onClose,
  children,
  align = "left",
}: PopoverPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion();

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
        className={`flex shrink-0 items-center gap-2 rounded-full border px-5 py-3 text-sm font-semibold shadow-md transition-all ${
          isActive
            ? "border-accent bg-accent text-white"
            : "border-[#2e2f3a] bg-[#1e1f26] text-white hover:border-slate-500"
        }`}
      >
        <Icon size={18} weight={isActive ? "fill" : "regular"} className={isActive ? "text-white" : "text-slate-300"} />
        {label}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className={`absolute top-full z-10 mt-2 w-72 rounded-2xl bg-surface p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_rgba(0,0,0,0.18)] ${
              align === "right" ? "right-0" : "left-0"
            }`}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
