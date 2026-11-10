/** Plain-words reasons a call ended on its own (the user hanging up needs none). */
export const END_REASON_LABEL: Record<string, string> = {
  cap: "The call reached its time limit.",
  idle: "The call ended after a quiet minute.",
  hidden: "The call ended because the app was in the background.",
};
