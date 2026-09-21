import type { ContactKind, InterviewKind, InterviewOutcome, WorkMode } from "@/lib/library/constants";

export const WORK_MODE_LABEL: Record<WorkMode, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };

export const INTERVIEW_KIND_LABEL: Record<InterviewKind, string> = {
  screen: "Screen",
  technical: "Technical",
  onsite: "Onsite",
  behavioral: "Behavioral",
  take_home: "Take-home",
  other: "Other",
};

export const INTERVIEW_OUTCOME_LABEL: Record<InterviewOutcome, string> = {
  pending: "Pending",
  passed: "Passed",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const CONTACT_KIND_LABEL: Record<ContactKind, string> = {
  recruiter: "Recruiter",
  referral: "Referral",
  hiring_manager: "Hiring manager",
  other: "Contact",
};
