import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";

/**
 * Static for now: full autocomplete against real location data lands in a
 * later step once the backend location lookup is wired up. This just needs
 * to look and feel like the real thing.
 */
export function LocationSearch() {
  return (
    <div className="w-full max-w-md">
      <label htmlFor="location-search" className="sr-only">
        Location
      </label>
      <div className="relative">
        <input
          id="location-search"
          type="text"
          placeholder="Select a location to begin"
          className="w-full rounded-full bg-white py-4 pl-6 pr-14 text-base text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)] outline-none placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-zinc-900/10"
        />
        <MagnifyingGlass
          className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-zinc-500"
          size={20}
          weight="bold"
        />
      </div>
    </div>
  );
}
