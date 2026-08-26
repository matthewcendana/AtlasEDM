import type { VenueEvent } from "./events";

// Parsed manually (rather than `new Date(dateIso)`) because that constructor treats
// a bare "YYYY-MM-DD" as UTC midnight — formatting it back with the viewer's local
// timezone can then roll the displayed date back a day for anyone west of UTC.
export function formatEventDate(dateIso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso);
  if (!match) return dateIso;

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// The backend's startTime is frequently null in practice (Edmtrain doesn't always
// have it) — callers should treat a null return as "no time to show", not an error.
export function formatEventTime(startTime: string | null): string | null {
  if (!startTime) return null;

  const match = /^(\d{1,2}):(\d{2})/.exec(startTime);
  if (!match) return null;

  const hours24 = Number(match[1]);
  const minutes = match[2];
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${minutes} ${period}`;
}

// b2bInd flags don't come through as adjacent pairs in practice, so rather than
// guess at pairing artists into "A b2b B" groups, each b2b artist is just tagged
// individually — accurate to the data without inventing a pairing that isn't there.
export function formatArtistNames(artists: VenueEvent["artists"]): string {
  if (artists.length === 0) return "Lineup TBA";
  return artists.map((artist) => (artist.b2bInd ? `${artist.name} (b2b)` : artist.name)).join(", ");
}
