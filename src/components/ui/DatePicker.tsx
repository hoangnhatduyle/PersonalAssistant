"use client";

import { useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { Popover } from "@/components/ui/Popover";
import { Input } from "@/components/ui/Input";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import {
  addDaysToDateKey,
  calendarDateToDateKey,
  dateKeyToCalendarDate,
  formatDateKeyForDisplay,
  parseTypedDate,
} from "@/lib/format/date-key";
import { todayInZone } from "@/lib/format/zoned-datetime";

type Props = {
  /** A date key ("YYYY-MM-DD"), or "" / null / undefined for no date. */
  value: string | null | undefined;
  /** Called with a date key, or "" when the field is cleared. Never called with a half-typed date. */
  onChange: (value: string) => void;
  id?: string;
  name?: string;
  invalid?: boolean;
  disabled?: boolean;
  placeholder?: string;
  "aria-label"?: string;
  className?: string;
};

const QUICK_PICKS: { label: string; daysFromToday: number }[] = [
  { label: "Today", daysFromToday: 0 },
  { label: "Tomorrow", daysFromToday: 1 },
  { label: "Next week", daysFromToday: 7 },
];

const CHIP_CLASS =
  "rounded-control border border-panel-border px-2 py-1 text-xs text-text-primary transition-colors hover:border-panel-border-hover hover:bg-panel focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-indigo/50";

/**
 * The app's date field: a text input you can type into ("2030-06-01" or
 * "6/1/2030") plus a calendar popover with Today / Tomorrow / Next week
 * shortcuts. Replaces the native `<input type="date">`.
 *
 * The input is a real, labelled `<input>` (so `<label htmlFor>` and
 * `getByLabelText` keep working). It emits a value as soon as the text is a
 * complete, real date — never a half-typed one — and shows the typed text
 * as-is while focused, then re-formats from the value on blur. "Today" is
 * today in the profile time zone (Settings), not the device's or UTC's.
 */
export function DatePicker({
  value,
  onChange,
  id,
  name,
  invalid = false,
  disabled = false,
  placeholder = "M/D/YYYY",
  "aria-label": ariaLabel,
  className = "",
}: Props) {
  const timeZone = useUserTimezone();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  // What the user has typed while editing; null means "show the formatted value".
  const [draft, setDraft] = useState<string | null>(null);

  const selected = dateKeyToCalendarDate(value);
  const today = todayInZone(timeZone);
  const draftIsInvalid = draft !== null && draft.trim() !== "" && parseTypedDate(draft) === null;

  const commit = (dateKey: string) => {
    setDraft(null);
    onChange(dateKey);
  };

  const handleTextChange = (text: string) => {
    setDraft(text);
    if (text.trim() === "") {
      onChange("");
      return;
    }
    const dateKey = parseTypedDate(text);
    if (dateKey) onChange(dateKey);
  };

  const pick = (dateKey: string) => {
    commit(dateKey);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <Input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        autoComplete="off"
        placeholder={placeholder}
        aria-label={ariaLabel}
        disabled={disabled}
        invalid={invalid || draftIsInvalid}
        value={draft ?? formatDateKeyForDisplay(value)}
        onChange={(event) => handleTextChange(event.target.value)}
        onBlur={() => setDraft(null)}
        className="pr-10"
      />
      <button
        type="button"
        aria-label="Open calendar"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
        className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-control text-text-secondary transition-colors hover:bg-panel hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-indigo/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
          <path d="M3.5 10h17M8 3v4M16 3v4" />
        </svg>
      </button>

      <Popover open={isOpen} onClose={() => setIsOpen(false)} anchorRef={wrapperRef} returnFocusRef={inputRef} label="Choose date">
        <div className="flex flex-wrap gap-1.5 pb-2">
          {QUICK_PICKS.map(({ label, daysFromToday }) => (
            <button key={label} type="button" className={CHIP_CLASS} onClick={() => pick(addDaysToDateKey(today, daysFromToday))}>
              {label}
            </button>
          ))}
          {selected && (
            <button type="button" className={`${CHIP_CLASS} ml-auto text-text-secondary`} onClick={() => pick("")}>
              Clear
            </button>
          )}
        </div>
        <DayPicker
          className="cadence-day-picker"
          mode="single"
          // `required` keeps clicking the already-selected day a selection (it would otherwise deselect to undefined).
          required
          selected={selected}
          onSelect={(date) => pick(calendarDateToDateKey(date))}
          defaultMonth={selected ?? dateKeyToCalendarDate(today)}
          today={dateKeyToCalendarDate(today)}
          showOutsideDays
          autoFocus
        />
      </Popover>
    </div>
  );
}
