import { LoadingSpinner } from "../_components/LoadingSpinner";

// Shown whenever a filter change (not a pan/zoom) has a refetch in flight — small
// and localized on purpose, unlike the full-screen globe/flyTo overlay used for the
// initial search-arrival transition, which is a different, much heavier moment and
// would be disproportionate here.
export function MapLoadingIndicator() {
  return (
    <div className="flex items-center gap-2 rounded-full bg-zinc-950/85 px-4 py-2 text-xs font-semibold text-white shadow-[0_4px_16px_rgba(0,0,0,0.25)] backdrop-blur-sm">
      <LoadingSpinner size={14} />
      Updating map…
    </div>
  );
}
