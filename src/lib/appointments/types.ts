export interface Appointment {
  id: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  category: string;
  /** Free text, e.g. "Arrive by 9:00 AM" — not a strict time input, matching the reference tracker. */
  time?: string;
  location?: string;
  notes?: string[];
  createdAt: string;
}

// Inferred from the one category ("Health") visible in the reference
// tracker's screenshot — adjust freely once you see the live picker.
export const APPOINTMENT_CATEGORIES = ["Health", "Academic", "Personal", "Career", "Other"] as const;

/**
 * 24 hours. A single non-recurring Appointment/Event's duration_minutes is
 * capped at this so a multi-day request (e.g. a 4-day festival, 7-11pm each
 * night) can't collapse into one appointment whose block silently spans
 * several calendar days — it must become one appointment per day instead,
 * or a recurring appointment (meeting_blocks) for a repeating pattern.
 */
export const MAX_APPOINTMENT_DURATION_MINUTES = 1440;
