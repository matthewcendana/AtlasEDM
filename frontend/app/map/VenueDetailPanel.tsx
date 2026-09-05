"use client";

import type { Venue } from "../_lib/events";
import { Card } from "../_components/ui/Card";
import { EventCard } from "../_components/ui/EventCard";

interface VenueDetailPanelProps {
  venue: Venue;
  onClose: () => void;
}

export function VenueDetailPanel({ venue, onClose }: VenueDetailPanelProps) {
  const hasMoreEvents = venue.totalEventCount > venue.events.length;

  return (
    <Card variant="sidebar" title={`Events at: ${venue.name}`} onClose={onClose} closeLabel="Close venue details">
      {venue.events.length === 0 ? (
        <p className="flex-1 px-6 py-10 text-center text-sm text-text-secondary">
          No upcoming events listed for this venue.
        </p>
      ) : (
        <>
          {hasMoreEvents && (
            <p className="px-6 pt-4 text-xs font-medium text-text-secondary">
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
    </Card>
  );
}
