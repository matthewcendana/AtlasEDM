"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

interface TooltipProps {
  label: string;
  children: React.ReactNode;
  // Which side of the trigger the bubble appears on. Defaults to below, the usual
  // reading direction for a top-of-screen trigger.
  side?: "top" | "bottom" | "left" | "right";
}

const SIDE_CLASSES = {
  top: "bottom-full left-1/2 mb-2 -translate-x-1/2",
  bottom: "top-full left-1/2 mt-2 -translate-x-1/2",
  left: "right-full top-1/2 mr-2 -translate-y-1/2",
  right: "left-full top-1/2 ml-2 -translate-y-1/2",
} as const;

// A small positioned tooltip bubble with a short fade-in, shown on hover/focus of
// its child - deliberately not the native `title` attribute, which reads as a
// generic browser tooltip (delayed, unstyled) rather than an intentional piece of
// UI. The trigger itself should still carry its own `aria-label`, since this bubble
// is purely visual (hidden from screen readers) and shouldn't be the only source of
// its label.
//
// Always `relative` (no caller-configurable className on this wrapper): a caller
// that needs to position the whole trigger+tooltip unit on the page should wrap
// this component in their own element rather than pass a `position` utility in
// here, since `absolute`/`relative` on the same element fight over the same CSS
// property with no reliable winner based on JSX class order.
export function Tooltip({ label, children, side = "bottom" }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const reduceMotion = useReducedMotion();

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      {children}
      <AnimatePresence>
        {isVisible && (
          <motion.span
            aria-hidden="true"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-xs font-medium text-white shadow-lg ${SIDE_CLASSES[side]}`}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
