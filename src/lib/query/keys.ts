/** Centralized TanStack Query key factories, one per entity. */

export const courseKeys = {
  all: ["courses"] as const,
  list: (filters?: object) => [...courseKeys.all, "list", filters ?? {}] as const,
  detail: (id: string) => [...courseKeys.all, "detail", id] as const,
};

export const deadlineKeys = {
  all: ["deadlines"] as const,
  list: (filters?: object) => [...deadlineKeys.all, "list", filters ?? {}] as const,
  detail: (id: string) => [...deadlineKeys.all, "detail", id] as const,
};

export const taskKeys = {
  all: ["tasks"] as const,
  list: (filters?: object) => [...taskKeys.all, "list", filters ?? {}] as const,
  detail: (id: string) => [...taskKeys.all, "detail", id] as const,
};

export const noteKeys = {
  all: ["notes"] as const,
  list: (filters?: object) => [...noteKeys.all, "list", filters ?? {}] as const,
  detail: (id: string) => [...noteKeys.all, "detail", id] as const,
};

export const reminderKeys = {
  all: ["reminders"] as const,
  list: (filters?: object) => [...reminderKeys.all, "list", filters ?? {}] as const,
};

export const feedbackKeys = {
  all: ["feedback"] as const,
  list: () => [...feedbackKeys.all, "list"] as const,
};

export const knowledgeKeys = {
  all: ["knowledge"] as const,
  list: (filters?: object) => [...knowledgeKeys.all, "list", filters ?? {}] as const,
  detail: (id: string) => [...knowledgeKeys.all, "detail", id] as const,
};

export const settingsKeys = {
  all: ["settings"] as const,
};
