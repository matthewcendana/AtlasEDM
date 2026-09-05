import type { Venue } from "../_lib/events";
import { Card } from "./ui/Card";
import { EventCard } from "./ui/EventCard";

interface FestivalPopupCardProps {
  venue: Venue;
  // Absolute-positioning styles (top/left or top/right, computed by the caller from
  // the click point relative to the globe container) — kept as a plain style object
  // rather than re-deriving side/offset logic in here, since the caller is the one
  // that actually knows the container's dimensions and where the click landed.
  style: React.CSSProperties;
  onClose: () => void;
}

// Compact popup version of VenueDetailPanel's event list - same data, same
// EventCard component (in "compact" size), sized and positioned for a small
// anchored card next to a clicked pin rather than a full-height sidebar.
export function FestivalPopupCard({ venue, style, onClose }: FestivalPopupCardProps) {
  const hasMoreEvents = venue.totalEventCount > venue.events.length;

  return (
    <Card variant="popover" title={venue.name} onClose={onClose} closeLabel="Close festival details" style={style}>
      {venue.events.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-text-secondary">
          No upcoming dates listed for this festival.
        </p>
      ) : (
        <div className="flex flex-col overflow-y-auto px-4 py-3">
          {hasMoreEvents && (
            <p className="mb-2 text-[11px] font-medium text-text-secondary">
              Showing {venue.events.length} of {venue.totalEventCount} dates
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {venue.events.map((event) => (
              <EventCard key={event.id} event={event} size="compact" />
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
