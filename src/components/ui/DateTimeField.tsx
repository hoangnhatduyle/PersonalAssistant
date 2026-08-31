import { Input } from "@/components/ui/Input";

type Props = {
  /** Full ISO 8601 datetime with offset (what the API schemas expect), or null/undefined for empty. */
  value: string | null | undefined;
  onChange: (isoValue: string | null) => void;
  invalid?: boolean;
  id?: string;
  name?: string;
};

/** Converts between the API's ISO-with-offset string and the browser's offset-less datetime-local value. */
function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function DateTimeField({ value, onChange, invalid, id, name }: Props) {
  return (
    <Input
      id={id}
      name={name}
      type="datetime-local"
      invalid={invalid}
      value={toLocalInputValue(value)}
      onChange={(event) => {
        const raw = event.target.value;
        onChange(raw ? new Date(raw).toISOString() : null);
      }}
    />
  );
}
