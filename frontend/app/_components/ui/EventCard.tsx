import type { VenueEvent } from "../../_lib/events";
import {
  formatArtistNames,
  formatEventDateParts,
  formatEventTime,
  isFestivalEvent,
} from "../../_lib/eventFormatting";
import { Badge } from "./Badge";

interface EventCardProps {
  event: VenueEvent;
}

// VenueDetailPanel's sidebar event card: a standalone date badge on the left (month/
// day/weekday, stacked), title + age badge in a row, "View on Edmtrain" pinned
// bottom-right. A dedicated component rather than a third EventRow size variant —
// the layout is structurally different (badge-based, not a flowing meta line), not
// just a size tweak, so sharing render logic with EventRow's compact
// (FestivalPopupCard) row would mean branching the whole JSX tree rather than a few
// className tokens.
export function EventCard({ event }: EventCardProps) {
  const dateParts = formatEventDateParts(event.date);
  const time = formatEventTime(event.startTime);
  const isFestival = isFestivalEvent(event);

  return (
    <li
      className={`flex items-start gap-4 rounded-2xl bg-surface-sunken p-5 shadow-sm transition-colors duration-200 ${
        isFestival
          ? "border-y border-r border-border border-l-4 border-l-accent hover:border-y-text-secondary/30 hover:border-r-text-secondary/30"
          : "border border-border hover:border-text-secondary/30"
      }`}
    >
      {dateParts && (
        <div className="flex min-w-16 shrink-0 flex-col items-center justify-center self-start rounded-xl border border-border bg-surface px-3 py-2.5 text-center">
          <span className="text-[11px] font-bold uppercase tracking-wider text-accent">{dateParts.month}</span>
          <span className="my-0.5 text-2xl leading-none font-black text-text-primary">{dateParts.day}</span>
          <span className="text-[10px] font-semibold uppercase text-text-secondary">{dateParts.weekday}</span>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col justify-between self-stretch">
        <div>
          {isFestival && (
            <Badge variant="accent" className="mb-1.5">
              Festival
            </Badge>
          )}
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-xl leading-tight font-bold tracking-tight break-words text-text-primary md:text-2xl">
              {isFestival ? event.name : formatArtistNames(event.artists)}
            </h2>
            {event.ages && (
              <span className="shrink-0 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-semibold tracking-wide text-text-secondary uppercase">
                {event.ages}
              </span>
            )}
          </div>
          {isFestival && (
            <p className="mt-1 text-sm text-text-secondary">{formatArtistNames(event.artists, "Lineup TBD")}</p>
          )}
          {time && <p className="mt-1 text-xs font-medium text-text-secondary">{time}</p>}
        </div>

        <div className="mt-5 flex justify-end">
          <a
            href={event.link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-xs font-bold tracking-wide text-accent uppercase transition-colors hover:text-accent/80"
          >
            View on Edmtrain
          </a>
        </div>
      </div>
    </li>
  );
}
