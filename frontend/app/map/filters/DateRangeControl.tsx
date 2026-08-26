"use client";

import { useState } from "react";
import { CalendarBlank, CaretLeft, CaretRight, X } from "@phosphor-icons/react/dist/ssr";
import { FilterPopoverButton } from "./FilterPopoverButton";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

// Parsed/formatted via local date components throughout (never `new Date(iso)` or
// `.toISOString()`) — both round-trip through UTC and can roll the date a day in
// either direction depending on the viewer's timezone, same pitfall documented in
// eventFormatting.ts.
function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromIsoDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatShort(iso: string): string {
  return fromIsoDate(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

// Returns a flat 6*7 grid (including leading/trailing blanks) so every month renders
// a consistent 6-row layout without the grid height jumping around as the user
// navigates.
function buildCalendarGrid(monthStart: Date): (Date | null)[] {
  const firstWeekday = monthStart.getDay();
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(new Date(monthStart.getFullYear(), monthStart.getMonth(), day));
  }
  while (cells.length < 42) cells.push(null);
  return cells;
}

interface MiniCalendarProps {
  selected: string | null;
  onSelect: (iso: string) => void;
}

// A single-date picker — no range/two-click logic — since Start date and End date
// are now independent fields that each just need "pick one day."
function MiniCalendar({ selected, onSelect }: MiniCalendarProps) {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(selected ? fromIsoDate(selected) : new Date()));
  const cells = buildCalendarGrid(viewMonth);

  return (
    <div className="mt-2 w-64 rounded-2xl bg-panel-light p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => setViewMonth((m) => addMonths(m, -1))}
          className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-500 hover:bg-white"
        >
          <CaretLeft size={13} weight="bold" />
        </button>
        <p className="text-xs font-semibold text-zinc-950">
          {viewMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </p>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => setViewMonth((m) => addMonths(m, 1))}
          className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-500 hover:bg-white"
        >
          <CaretRight size={13} weight="bold" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAY_LABELS.map((weekday, i) => (
          <span key={i} className="text-[10px] font-semibold text-zinc-400">
            {weekday}
          </span>
        ))}
        {cells.map((day, i) => {
          if (!day) return <span key={i} />;
          const iso = toIsoDate(day);
          const isSelected = iso === selected;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(iso)}
              className={`flex h-7 w-7 items-center justify-center justify-self-center rounded-full text-xs font-medium transition-colors ${
                isSelected ? "bg-accent text-white" : "text-zinc-700 hover:bg-white"
              }`}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface SingleDateFieldProps {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  isOpen: boolean;
  onToggle: () => void;
}

// One independently-editable date — its own label, its own trigger, its own
// calendar — so Start date and End date never force a particular selection order on
// each other the way a single click-start-then-click-end range picker used to.
function SingleDateField({ label, value, onChange, isOpen, onToggle }: SingleDateFieldProps) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">{label}</p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onToggle}
          className={`flex flex-1 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors ${
            value ? "bg-accent/10 text-zinc-950" : "bg-panel-light text-zinc-400"
          }`}
        >
          <CalendarBlank size={15} weight={value ? "fill" : "regular"} className={value ? "text-accent" : ""} />
          {value ? formatShort(value) : "Any date"}
        </button>
        {value && (
          <button
            type="button"
            aria-label={`Clear ${label.toLowerCase()}`}
            onClick={() => onChange(null)}
            className="text-zinc-400 hover:text-zinc-700"
          >
            <X size={14} weight="bold" />
          </button>
        )}
      </div>
      {isOpen && (
        <MiniCalendar
          selected={value}
          onSelect={(iso) => {
            onChange(iso);
            onToggle();
          }}
        />
      )}
    </div>
  );
}

interface DateRangeControlProps {
  startDate: string | null;
  endDate: string | null;
  onChange: (startDate: string | null, endDate: string | null) => void;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

export function DateRangeControl({
  startDate,
  endDate,
  onChange,
  isOpen,
  onToggle,
  onClose,
}: DateRangeControlProps) {
  const [openField, setOpenField] = useState<"start" | "end" | null>(null);
  const isActive = startDate !== null || endDate !== null;

  const label =
    startDate && endDate
      ? `${formatShort(startDate)} – ${formatShort(endDate)}`
      : startDate
        ? `From ${formatShort(startDate)}`
        : endDate
          ? `Until ${formatShort(endDate)}`
          : "Date range";

  return (
    <FilterPopoverButton
      icon={CalendarBlank}
      label={label}
      isOpen={isOpen}
      isActive={isActive}
      onToggle={onToggle}
      onClose={() => {
        onClose();
        setOpenField(null);
      }}
    >
      <div className="flex flex-col gap-4">
        <SingleDateField
          label="Start date"
          value={startDate}
          onChange={(value) => onChange(value, endDate)}
          isOpen={openField === "start"}
          onToggle={() => setOpenField((f) => (f === "start" ? null : "start"))}
        />
        <SingleDateField
          label="End date"
          value={endDate}
          onChange={(value) => onChange(startDate, value)}
          isOpen={openField === "end"}
          onToggle={() => setOpenField((f) => (f === "end" ? null : "end"))}
        />
      </div>

      {isActive && (
        <button
          type="button"
          onClick={() => {
            onChange(null, null);
            setOpenField(null);
          }}
          className="mt-4 text-xs font-semibold text-zinc-400 hover:text-zinc-700"
        >
          Clear dates
        </button>
      )}
    </FilterPopoverButton>
  );
}
