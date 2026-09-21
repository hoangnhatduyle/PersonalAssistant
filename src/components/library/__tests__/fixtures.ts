import type { LibraryApplicationWithEmployer, LibraryEmployerListItem } from "@/lib/api/entity-types";

export function application(id: string, overrides: Partial<LibraryApplicationWithEmployer> = {}): LibraryApplicationWithEmployer {
  return {
    id,
    user_id: "u",
    employer_id: "e1",
    title: `Role ${id}`,
    job_url: null,
    normalized_job_url: null,
    location: null,
    work_mode: null,
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    salary_period: null,
    tech_stack: [],
    date_found: "2026-09-01",
    status: "interested",
    status_changed_at: "2026-09-10T12:00:00.000Z",
    notes: "",
    deleted_at: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    employer: { id: "e1", name: "Acme" },
    ...overrides,
  };
}

export function employer(overrides: Partial<LibraryEmployerListItem> = {}): LibraryEmployerListItem {
  return {
    id: "e1",
    user_id: "u",
    name: "Acme Corp",
    website: "https://www.acme.com",
    careers_url: null,
    notes: "",
    archived_at: null,
    deleted_at: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    applications: [],
    contacts: [],
    ...overrides,
  };
}
