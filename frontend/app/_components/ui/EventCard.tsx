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
  // "default" is VenueDetailPanel's full sidebar row (shows an age-restriction
  // badge). "compact" is FestivalPopupCard's narrower popover row (288px wide,
  // anchored to a clicked globe pin) — same badge-based layout, smaller date badge/
  // text/padding, and no age badge (there's never room for it at that width, same
  // omission the old EventRow's compact size made).
  size?: "default" | "compact";
}

const SIZE_CLASSES = {
  default: {
    root: "gap-4 rounded-2xl p-5",
    badge: "min-w-16 rounded-xl px-3 py-2.5",
    month: "text-[11px]",
    day: "my-0.5 text-2xl",
    weekday: "text-[10px]",
    title: "text-xl md:text-2xl",
    age: "px-2.5 py-1 text-xs",
    subheading: "mt-1 text-sm",
    meta: "mt-1 text-xs",
    link: "mt-5 text-xs",
  },
  compact: {
    root: "gap-3 rounded-xl p-3",
    badge: "min-w-12 rounded-lg px-2 py-1.5",
    month: "text-[9px]",
    day: "my-0.5 text-base",
    weekday: "text-[8px]",
    title: "text-xs",
    age: "px-2 py-0.5 text-[10px]",
    subheading: "mt-0.5 text-[11px]",
    meta: "mt-0.5 text-[11px]",
    link: "mt-2 text-[11px]",
  },
} as const;

// The badge-based event card (standalone date badge on the left; title + age badge
// in a row, "View on Edmtrain" pinned bottom-right, on the right) used by both
// VenueDetailPanel's sidebar ("default") and FestivalPopupCard's popover
// ("compact") — one shared layout/style so the two read as the same design
// language rather than the popover's older, structurally different flowing-text
// row (the previous EventRow component, now unused and removed).
export function EventCard({ event, size = "default" }: EventCardProps) {
  const dateParts = formatEventDateParts(event.date);
  const time = formatEventTime(event.startTime);
  const isFestival = isFestivalEvent(event);
  const classes = SIZE_CLASSES[size];

  return (
    <li
      className={`flex items-start bg-surface-sunken shadow-sm transition-colors duration-200 ${classes.root} ${
        isFestival
          ? "border-y border-r border-border border-l-4 border-l-accent hover:border-y-text-secondary/30 hover:border-r-text-secondary/30"
          : "border border-border hover:border-text-secondary/30"
      }`}
    >
      {dateParts && (
        <div
          className={`flex shrink-0 flex-col items-center justify-center self-start border border-border bg-surface text-center ${classes.badge}`}
        >
          <span className={`font-bold uppercase tracking-wider text-accent ${classes.month}`}>
            {dateParts.month}
          </span>
          <span className={`leading-none font-black text-text-primary ${classes.day}`}>{dateParts.day}</span>
          <span className={`font-semibold uppercase text-text-secondary ${classes.weekday}`}>
            {dateParts.weekday}
          </span>
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
            <h2 className={`leading-tight font-bold tracking-tight break-words text-text-primary ${classes.title}`}>
              {isFestival ? event.name : formatArtistNames(event.artists)}
            </h2>
            {size === "default" && event.ages && (
              <span
                className={`shrink-0 rounded-md border border-border bg-surface font-semibold tracking-wide text-text-secondary uppercase ${classes.age}`}
              >
                {event.ages}
              </span>
            )}
          </div>
          {isFestival && (
            <p className={`text-text-secondary ${classes.subheading}`}>
              {formatArtistNames(event.artists, "Lineup TBD")}
            </p>
          )}
          {time && <p className={`font-medium text-text-secondary ${classes.meta}`}>{time}</p>}
        </div>

        <div className={`flex justify-end ${classes.link}`}>
          <a
            href={event.link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center font-bold tracking-wide text-accent uppercase transition-colors hover:text-accent/80"
          >
            View on Edmtrain
          </a>
        </div>
      </div>
    </li>
  );
}
