// Labels' fixed color palette (Phase 3 of the Trello-style card-detail
// modal, supabase/migrations/0031_labels.sql): 10 hues x 3 shades (light,
// default, dark) = 30 swatches, matching Trello's actual label color grid
// (screenshots-verified) rather than an arbitrary hex picker like
// people.color. Ordered by hue then shade — the same order
// LabelEditor's swatch grid renders in.
export const LABEL_COLOR_TOKENS = [
  "green-light",
  "green",
  "green-dark",
  "yellow-light",
  "yellow",
  "yellow-dark",
  "orange-light",
  "orange",
  "orange-dark",
  "red-light",
  "red",
  "red-dark",
  "purple-light",
  "purple",
  "purple-dark",
  "blue-light",
  "blue",
  "blue-dark",
  "sky-light",
  "sky",
  "sky-dark",
  "lime-light",
  "lime",
  "lime-dark",
  "pink-light",
  "pink",
  "pink-dark",
  "black-light",
  "black",
  "black-dark",
] as const;

export type LabelColorToken = (typeof LABEL_COLOR_TOKENS)[number];

// A direct lookup, no runtime hex math needed — unlike people.color's
// inline-style approach, this fixed set can be hardcoded once, same spirit
// as status-colors.ts's TONE_CLASSES. yellow/lime's "default" shade keeps
// dark text (those Tailwind families are still bright at 500) — every other
// hue's default/dark shade uses white text.
export const LABEL_COLOR_SWATCH_CLASSES: Record<LabelColorToken, string> = {
  "green-light": "bg-emerald-200 text-emerald-900",
  green: "bg-emerald-500 text-white",
  "green-dark": "bg-emerald-800 text-emerald-50",

  "yellow-light": "bg-yellow-200 text-yellow-900",
  yellow: "bg-yellow-500 text-yellow-950",
  "yellow-dark": "bg-yellow-800 text-yellow-50",

  "orange-light": "bg-orange-200 text-orange-900",
  orange: "bg-orange-500 text-white",
  "orange-dark": "bg-orange-800 text-orange-50",

  "red-light": "bg-red-200 text-red-900",
  red: "bg-red-500 text-white",
  "red-dark": "bg-red-800 text-red-50",

  "purple-light": "bg-purple-200 text-purple-900",
  purple: "bg-purple-500 text-white",
  "purple-dark": "bg-purple-800 text-purple-50",

  "blue-light": "bg-blue-200 text-blue-900",
  blue: "bg-blue-500 text-white",
  "blue-dark": "bg-blue-800 text-blue-50",

  "sky-light": "bg-sky-200 text-sky-900",
  sky: "bg-sky-500 text-white",
  "sky-dark": "bg-sky-800 text-sky-50",

  "lime-light": "bg-lime-200 text-lime-900",
  lime: "bg-lime-500 text-lime-950",
  "lime-dark": "bg-lime-800 text-lime-50",

  "pink-light": "bg-pink-200 text-pink-900",
  pink: "bg-pink-500 text-white",
  "pink-dark": "bg-pink-800 text-pink-50",

  "black-light": "bg-neutral-300 text-neutral-900",
  black: "bg-neutral-600 text-white",
  "black-dark": "bg-neutral-900 text-neutral-100",
};

/** "Remove color" / colorless label — a neutral outline instead of any swatch fill. */
export const LABEL_COLORLESS_CLASSES = "border border-panel-border text-text-secondary";

export function labelSwatchClasses(color: LabelColorToken | null): string {
  return color ? LABEL_COLOR_SWATCH_CLASSES[color] : LABEL_COLORLESS_CLASSES;
}
