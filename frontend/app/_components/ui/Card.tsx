"use client";

import { motion, useReducedMotion } from "motion/react";
import { IconButton } from "./IconButton";

interface CardProps {
  // "sidebar" is VenueDetailPanel's full-height panel, flush to the viewport edge.
  // "popover" is FestivalPopupCard's small floating card, anchored next to a
  // clicked pin via caller-supplied `style` (absolute top/left, computed from the
  // click point - see LandingMap.tsx's computePopupPosition).
  variant: "sidebar" | "popover";
  title: string;
  onClose: () => void;
  closeLabel: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

const VARIANT_CLASSES = {
  sidebar: {
    root: "relative z-10 flex h-full w-[420px] shrink-0 flex-col overflow-hidden bg-surface shadow-[4px_0_24px_rgba(0,0,0,0.1)]",
    header: "gap-4 px-6 py-5",
    title: "text-lg",
  },
  popover: {
    root: "absolute z-30 flex max-h-80 w-72 flex-col overflow-hidden rounded-2xl bg-surface shadow-[0_8px_32px_rgba(0,0,0,0.35)]",
    header: "gap-3 px-4 py-3",
    title: "text-sm leading-snug",
  },
} as const;

// The header-with-close-button shell shared by VenueDetailPanel's sidebar and
// FestivalPopupCard's popover - same structure, different sizing/positioning.
//
// Both variants animate in/out: the popover fades + scales slightly (matching a
// clicked pin producing a small anchored card), the sidebar slides in from the left
// edge of the screen (matching a clicked venue pin opening a structural panel, not a
// momentary popup). Transform-only (`x`), not a width/margin animation, so the
// sidebar's already-reserved 420px flex slot doesn't resize during the animation -
// only its own content visually slides into it. See MapView.tsx/LandingMap.tsx for
// the AnimatePresence boundary this needs to actually animate out on close (swapping
// which venue is shown does NOT replay the animation - only true open/close does,
// matching the existing swap-without-closing-first interaction).
export function Card({ variant, title, onClose, closeLabel, style, children }: CardProps) {
  const classes = VARIANT_CLASSES[variant];
  const reduceMotion = useReducedMotion();

  const header = (
    <div className={`flex shrink-0 items-start justify-between border-b border-border ${classes.header}`}>
      <h2 className={`font-bold text-text-primary ${classes.title}`}>{title}</h2>
      <IconButton label={closeLabel} onClick={onClose} size={variant === "sidebar" ? 20 : 16} />
    </div>
  );

  if (variant === "sidebar") {
    return (
      <motion.div
        style={style}
        className={classes.root}
        initial={reduceMotion ? false : { x: "-100%" }}
        animate={{ x: 0 }}
        exit={reduceMotion ? undefined : { x: "-100%" }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      >
        {header}
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      style={style}
      className={classes.root}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={reduceMotion ? undefined : { opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
    >
      {header}
      {children}
    </motion.div>
  );
}
