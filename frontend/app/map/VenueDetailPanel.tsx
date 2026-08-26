"use client";

import { X } from "@phosphor-icons/react/dist/ssr";
import type { Venue, VenueEvent } from "../_lib/events";
import { formatArtistNames, formatEventDate, formatEventTime } from "../_lib/eventFormatting";

interface VenueDetailPanelProps {
  venue: Venue;
  onClose: () => void;
}

export function VenueDetailPanel({ venue, onClose }: VenueDetailPanelProps) {
  const hasMoreEvents = venue.totalEventCount > venue.events.length;

  return (
    <div className="relative z-10 flex h-full w-[420px] shrink-0 flex-col overflow-hidden bg-white shadow-[4px_0_24px_rgba(0,0,0,0.1)]">
      <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-6 py-5">
        <div>
          <h2 className="text-lg font-bold text-zinc-950">{venue.name}</h2>
          <p className="text-sm text-zinc-500">
            {venue.latitude.toFixed(4)}, {venue.longitude.toFixed(4)}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close venue details"
          onClick={onClose}
          className="shrink-0 text-zinc-400 hover:text-zinc-900"
        >
          <X size={20} weight="bold" />
        </button>
      </div>

      {venue.events.length === 0 ? (
        <p className="flex-1 px-6 py-10 text-center text-sm text-zinc-500">
          No upcoming events listed for this venue.
        </p>
      ) : (
        <>
          {hasMoreEvents && (
            <p className="px-6 pt-4 text-xs font-medium text-zinc-500">
              Showing {venue.events.length} of {venue.totalEventCount} events
            </p>
          )}
          <ul className="flex flex-1 flex-col gap-3 overflow-y-auto px-6 py-4">
            {venue.events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function EventCard({ event }: { event: VenueEvent }) {
  const time = formatEventTime(event.startTime);

  return (
    <li className="rounded-xl bg-panel-light px-4 py-3">
      <p className="text-sm font-semibold text-zinc-950">{formatArtistNames(event.artists)}</p>
      <p className="mt-1 text-xs text-zinc-500">
        {formatEventDate(event.date)}
        {time && ` · ${time}`}
        {event.ages && ` · ${event.ages}`}
      </p>
      <a
        href={event.link}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-block text-xs font-semibold text-accent hover:underline"
      >
        View on Edmtrain
      </a>
    </li>
  );
}
