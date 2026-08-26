import { CircleNotch } from "@phosphor-icons/react/dist/ssr";

interface LoadingSpinnerProps {
  size?: number;
  className?: string;
}

// The one spinning-icon primitive reused everywhere something small and localized is
// loading (an autocomplete dropdown in flight, a filter-triggered map refetch) —
// composed into context-specific chrome by each caller rather than each rolling its
// own spinner. Not for the landing-page-style full-screen transition overlay, which
// is a different, purpose-built loading experience.
export function LoadingSpinner({ size = 16, className = "" }: LoadingSpinnerProps) {
  return <CircleNotch size={size} weight="bold" className={`animate-spin ${className}`} />;
}
