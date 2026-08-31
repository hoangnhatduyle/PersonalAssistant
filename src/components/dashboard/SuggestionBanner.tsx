import { buildSuggestion } from "@/lib/dashboard/suggestion";
import { toneClasses } from "@/lib/status-colors";
import type { DeadlineRow, TaskRow } from "@/lib/api/entity-types";

type Props = {
  deadlines: DeadlineRow[];
  tasks: TaskRow[];
};

export function SuggestionBanner({ deadlines, tasks }: Props) {
  const { tone, message } = buildSuggestion(deadlines, tasks);

  return <div className={`rounded-panel border px-4 py-3 text-sm ${toneClasses(tone)}`}>{message}</div>;
}
