"use client";

import { useState } from "react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { LEAD_UNITS, leadToMinutes, minutesToLead, type LeadUnit } from "@/lib/reminders/lead-time";

type Props = {
  /** The lead time in minutes — the only unit ever stored or sent to the API. */
  value: number;
  /** Called with the converted minutes on every edit; NaN while the amount is empty so the form's validator can flag it. */
  onChange: (minutes: number) => void;
  id: string;
  invalid?: boolean;
  className?: string;
};

/**
 * Amount + unit (minute(s)/hour(s)/day(s)) editor for a reminder lead time.
 * Seeds from `value` once — the largest unit that divides it evenly, so 120
 * opens as "2 hours" — then keeps its own amount/unit state so typing "1"
 * then switching unit doesn't get rewritten back under the user's cursor.
 */
export function ReminderLeadInput({ value, onChange, id, invalid = false, className = "" }: Props) {
  const [initial] = useState(() => minutesToLead(value));
  const [amount, setAmount] = useState(String(initial.amount));
  const [unit, setUnit] = useState<LeadUnit>(initial.unit);

  const emit = (nextAmount: string, nextUnit: LeadUnit) => {
    onChange(nextAmount.trim() === "" ? Number.NaN : leadToMinutes(Number(nextAmount), nextUnit));
  };

  return (
    <div className={`flex gap-2 ${className}`}>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={amount}
        invalid={invalid}
        className="w-28"
        onChange={(event) => {
          setAmount(event.target.value);
          emit(event.target.value, unit);
        }}
      />
      <Select
        aria-label="Reminder lead time unit"
        value={unit}
        invalid={invalid}
        className="w-36"
        onChange={(event) => {
          const nextUnit = event.target.value as LeadUnit;
          setUnit(nextUnit);
          emit(amount, nextUnit);
        }}
      >
        {LEAD_UNITS.map((option) => (
          <option key={option.unit} value={option.unit}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
