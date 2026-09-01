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
