import type { VenueEvent } from "../../_lib/events";
import { formatArtistNames, formatEventDate, formatEventTime, isFestivalEvent } from "../../_lib/eventFormatting";
import { Badge } from "./Badge";

interface EventRowProps {
  event: VenueEvent;
  // "default" is VenueDetailPanel's full sidebar row (shows age restriction);
  // "compact" is FestivalPopupCard's smaller popup row (no age restriction line -
  // there was never room for it in a 288px-wide popup). Everything else about the
  // two was already identical in practice: both call the same formatting helpers,
  // and `isFestivalEvent` alone (not a caller-supplied flag) decides the
  // title/badge/border treatment correctly in both contexts, since a
  // FestivalPopupCard row is always a festival event anyway.
  size?: "default" | "compact";
}

const SIZE_CLASSES = {
  default: {
    root: "rounded-xl px-4 py-3",
    title: "text-sm",
    meta: "mt-1 text-xs",
    subheading: "mt-0.5 text-xs",
    link: "mt-2 text-xs",
  },
  compact: {
    root: "rounded-xl px-3 py-2",
    title: "text-xs",
    meta: "mt-0.5 text-[11px]",
    subheading: "mt-0.5 text-[11px]",
    link: "mt-1 text-[11px]",
  },
} as const;

// One event row, used by both VenueDetailPanel's sidebar list and
// FestivalPopupCard's compact popup list - previously two separately hand-rolled
// components (EventCard / FestivalEventRow) that had drifted into near-duplicates.
export function EventRow({ event, size = "default" }: EventRowProps) {
  const time = formatEventTime(event.startTime);
  const isFestival = isFestivalEvent(event);
  const classes = SIZE_CLASSES[size];

  return (
    <li
      className={`bg-surface-sunken ${classes.root} ${isFestival ? "border-l-4 border-accent" : ""}`}
    >
      {isFestival && (
        <Badge variant="accent" className="mb-1">
          Festival
        </Badge>
      )}
      <p className={`font-semibold text-text-primary ${classes.title}`}>
        {isFestival ? event.name : formatArtistNames(event.artists)}
      </p>
      {isFestival && (
        <p className={`text-text-secondary ${classes.subheading}`}>
          {formatArtistNames(event.artists, "Lineup TBD")}
        </p>
      )}
      <p className={`text-text-secondary ${classes.meta}`}>
        {formatEventDate(event.date)}
        {time && ` · ${time}`}
        {size === "default" && event.ages && ` · ${event.ages}`}
      </p>
      <a
        href={event.link}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-block font-semibold text-accent hover:underline ${classes.link}`}
      >
        View on Edmtrain
      </a>
    </li>
  );
}
