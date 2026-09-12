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

export const peopleKeys = {
  all: ["people"] as const,
  list: (filters?: object) => [...peopleKeys.all, "list", filters ?? {}] as const,
  detail: (id: string) => [...peopleKeys.all, "detail", id] as const,
};

export const noteKeys = {
  all: ["notes"] as const,
  list: (filters?: object) => [...noteKeys.all, "list", filters ?? {}] as const,
  detail: (id: string) => [...noteKeys.all, "detail", id] as const,
};

export const todoListKeys = {
  all: ["todo-lists"] as const,
  list: (filters?: object) => [...todoListKeys.all, "list", filters ?? {}] as const,
  detail: (id: string) => [...todoListKeys.all, "detail", id] as const,
};

export const checklistItemKeys = {
  all: ["checklist-items"] as const,
  list: (filters?: object) => [...checklistItemKeys.all, "list", filters ?? {}] as const,
};

export const labelKeys = {
  all: ["labels"] as const,
  list: (filters?: object) => [...labelKeys.all, "list", filters ?? {}] as const,
  detail: (id: string) => [...labelKeys.all, "detail", id] as const,
};

export const attachmentKeys = {
  all: ["task-attachments"] as const,
  list: (filters?: object) => [...attachmentKeys.all, "list", filters ?? {}] as const,
};

export const appointmentKeys = {
  all: ["appointments"] as const,
  list: (filters?: object) => [...appointmentKeys.all, "list", filters ?? {}] as const,
  detail: (id: string) => [...appointmentKeys.all, "detail", id] as const,
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
  content: (id: string) => [...knowledgeKeys.all, "content", id] as const,
};

export const settingsKeys = {
  all: ["settings"] as const,
};

export const personalizationSuggestionKeys = {
  all: ["personalization-suggestions"] as const,
  list: (filters?: object) => [...personalizationSuggestionKeys.all, "list", filters ?? {}] as const,
};
