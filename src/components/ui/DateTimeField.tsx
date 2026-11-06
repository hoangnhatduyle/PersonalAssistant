"use client";

import { useRef, useState } from "react";
import { DatePicker } from "@/components/ui/DatePicker";
import { Input } from "@/components/ui/Input";
import { useUserTimezone, useUserTimezoneReady } from "@/hooks/useUserTimezone";
import { isoToZonedParts, zonedPartsToIso } from "@/lib/format/zoned-datetime";

type Props = {
  /** Full ISO 8601 instant (what the API schemas expect), or null/undefined for empty. */
  value: string | null | undefined;
  onChange: (isoValue: string | null) => void;
  invalid?: boolean;
  /** Ids the date input; the time input is `${id}-time`. */
  id?: string;
  name?: string;
  /** The time used when a date is picked before any time was set. Defaults to 09:00. */
  defaultTime?: string;
  /** Accessible name for the date input when there is no <label htmlFor>. */
  ariaLabel?: string;
};

const DEFAULT_TIME = "09:00";
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Date + time of day, as one ISO instant. The date is a DatePicker (calendar
 * popover or typing); the time is a native time input beside it.
 *
 * The date and time are read and written in the profile time zone chosen in
 * Settings (useUserTimezone) — the zone every due date is displayed in — not
 * the browser's, so what you pick is exactly what the app shows afterward.
 * A date can't exist without a time, so the time input stays disabled until
 * a date is chosen, and choosing one fills `defaultTime`. Clearing the date
 * emits null. Both inputs stay disabled for the moment it takes the profile
 * zone to load (see useUserTimezoneReady).
 */
export function DateTimeField({ value, onChange, invalid, id, name, defaultTime = DEFAULT_TIME, ariaLabel }: Props) {
  const timeZone = useUserTimezone();
  // Typing before the profile zone is known would build the instant in the device-zone fallback and then re-read it in the real zone.
  const isZoneReady = useUserTimezoneReady();
  const parts = isoToZonedParts(value, timeZone);
  const date = parts?.date ?? "";
  const time = parts?.time ?? "";
  // What the user has typed into the time input mid-edit (it can be momentarily empty); null = show `time`.
  const [timeDraft, setTimeDraft] = useState<string | null>(null);
  // The last time of day in use, kept while the date text is momentarily empty (select-all + retype), so retyping a date doesn't reset the time.
  const lastTimeRef = useRef("");

  const emit = (nextDate: string, nextTime: string) => {
    lastTimeRef.current = nextTime;
    onChange(zonedPartsToIso(nextDate, nextTime, timeZone));
  };

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
      <DatePicker
        id={id}
        name={name}
        aria-label={ariaLabel}
        invalid={invalid}
        disabled={!isZoneReady}
        value={date}
        onChange={(nextDate) => {
          if (nextDate === "") {
            if (time) lastTimeRef.current = time;
            onChange(null);
          } else {
            emit(nextDate, time || lastTimeRef.current || defaultTime);
          }
        }}
      />
      <Input
        id={id ? `${id}-time` : undefined}
        type="time"
        aria-label="Time"
        invalid={invalid}
        disabled={date === "" || !isZoneReady}
        value={timeDraft ?? time}
        onChange={(event) => {
          const next = event.target.value;
          setTimeDraft(next);
          if (TIME_RE.test(next) && date !== "") emit(date, next);
        }}
        onBlur={() => setTimeDraft(null)}
        className="sm:w-auto"
      />
    </div>
  );
}
