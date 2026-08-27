# [PRD] Personal AI Assistant

> Canonical, spec-aware PRD for Harness OS. **Part A** is the product framing. **Part B**
> is the SDD-ready layer — it compiles directly into a machine-readable spec via
> `create_spec`, and its acceptance criteria seed the RED test gate. No technology,
> platform, or vendor choices are made in this document; those are deferred to the
> architecture/spec-implementation phase.

## Part A — Product framing

- **Problem / opportunity:**
  Hoang currently tracks his Fall 2026 MS CS schedule, assignments, deadlines, and
  personal appointments in a hand-built, single-file HTML page with `localStorage`
  persistence (`uc_fall_2026_schedule.html`). It works as a static reference and even
  handles some real coordination (a ride-plan grid shared with his sister Chau, a
  to-do list per class, an appointments timeline), but it has hard ceilings: no
  reminders, no voice interaction, data trapped in one browser on one device, no
  memory of user behavior, and everything is manually maintained. As the semester's
  course load and research commitments ramp up (5 courses / 15 units, plus
  self-study research), the cost of a missed deadline or a forgotten appointment
  rises, and a static page can't proactively help. There is an opportunity for a
  genuine personal assistant — one that tracks commitments, reminds and suggests
  proactively, is reachable by voice, and is trusted enough to become the single
  place Hoang's time-bound life lives.

- **Why now:**
  Fall 2026 classes begin August 24, 2026 — a concrete, near-term forcing function.
  The existing HTML artifact has already been extended repeatedly (course cards,
  weekly grid, ride plan, to-do lists, due-soon filters) and is visibly reaching the
  limits of what a static, single-device, manually-updated page can do. Building the
  real system now, at the start of a demanding semester, means it's exercised
  immediately under real stakes (real deadlines, real reminders that matter) rather
  than being designed in the abstract. Delay means another semester spent on a tool
  that cannot remind, cannot listen, and cannot follow Hoang across devices.

- **Target users:**
  - **Primary:** Hoang — MS Computer Science student, University of Cincinnati,
    Fall 2026. Manages a full course load, a self-study research track, and
    personal/family logistics (e.g., ride coordination). Wants one assistant that
    spans academic, personal, and eventually professional responsibilities.
  - **Secondary (future, post-v1):** Other students or professionals who want a
    personal organizational assistant with voice interaction and adaptive
    suggestions — considered for architecture direction but not built for in v1.
  - **Explicitly not for (v1):** Teams or organizations needing shared/collaborative
    accounts; institutions wanting an LMS or registrar replacement; anyone needing
    a public, multi-tenant product — v1 is a single-user system for Hoang.

- **Definition of success:**
  1. **Zero missed hard deadlines** tracked in-system across the Fall 2026 semester.
  2. **Reliable reminder trust:** at least 90% of delivered reminders are acted on or
     explicitly acknowledged (not silently ignored or dismissed unread).
  3. **Fast capture:** a new task, deadline, or appointment can be captured — by
     voice or text — in under ~15 seconds, from any supported device.
  4. **Cross-device continuity:** the same up-to-date schedule/tasks/deadlines are
     visible from every device Hoang uses, with no single-device-only data (a
     direct fix of the current `localStorage`-only limitation).
  5. **Improving personalization:** qualitative signal (fewer corrections needed
     over time, positive feedback ratio trending up) shows suggestions and
     reminder timing get better across the semester, not static from day one.

- **UX / design principles:**
  1. **Trustworthy over merely correct** — the system must never silently drop,
     lose, or misstate a commitment. When it's unsure, it says so and asks, rather
     than guessing quietly. This is the difference between a tool and a confidant.
  2. **Frictionless capture, any channel** — adding a class, deadline, task, or
     appointment must be just as fast by voice as by typing, and from any device.
  3. **Ambient, not naggy** — reminders and suggestions are timely and contextual,
     never spam; cadence and tone are within the user's control.
  4. **One pane of truth** — schedule, deadlines, tasks, and notes live in a single
     coherent system; no silent fragmentation across disconnected tools.
  5. **Privacy as a default, not a setting** — this holds sensitive academic and
     personal data and is meant to feel like a confidential personal secretary, not
     a data-harvesting app.

- **Scope TL;DR:**
  V1, targeted to be usable for the Fall 2026 semester, tracks Hoang's class
  schedule, assignments, and deadlines; supports task management and lightweight
  note-taking; delivers proactive reminders and suggestions; is reachable by voice
  (spoken input and spoken responses) as well as text; is accessible from desktop
  and mobile; and is built on strong authentication and encryption from the start,
  since it is meant to become Hoang's trusted, "official" personal assistant.
  Explicitly out for v1: multi-user/shared accounts, autonomous actions with
  real-world side effects (auto-submitting, auto-emailing, auto-registering) taken
  without explicit confirmation, deep third-party productivity-tool integrations
  beyond what's needed to get schedule data in, and any public/multi-tenant
  distribution.

- **Constraints & assumptions:**
  - Fall 2026 classes start August 24, 2026 — the core loop (schedule, deadlines,
    reminders) should be usable at or before that date.
  - Single user (Hoang) for v1. The data model should not preclude multiple users
    later, but multi-user features are not being built now.
  - Initial schedule data (courses, meeting times, rooms, instructors) is seeded
    from the existing HTML artifact and/or manual entry; no confirmed integration
    with a university LMS or registrar system exists yet.
  - Must be usable from at least one desktop and one mobile context; specific
    platforms/frameworks are deliberately undecided at this stage.
  - Because this is meant to be an "official," relied-upon assistant, security and
    privacy (strong auth, encryption at rest and in transit) are first-class
    requirements from v1, not deferred hardening.
  - Voice input and voice output are required in v1 per explicit user intent, not
    treated as a stretch goal — flagged as the highest-complexity item in scope.

- **Open questions & risks:**
  - **Risk:** "Natural and seamless" voice interaction is a subjective bar; needs a
    concrete, testable definition (e.g., specific latency and intent-accuracy
    targets) before it can be considered done, or scope will creep indefinitely.
  - **Risk:** "Learn from behavior and adapt" implies an ongoing personalization
    loop with data retention — this is in tension with the privacy-first principle
    and needs an explicit policy (what's retained, for how long, who can see it).
  - **Open question:** How much schedule/deadline data will be manually entered
    vs. imported from an external system? No integration is confirmed.
  - **Open question:** What are the measurable bars for "reliable and trustworthy"
    (acceptable downtime, acceptable data-loss window, backup/recovery expectations)?
  - **Risk:** Building single-user now and multi-user later is fine functionally,
    but if the underlying data model isn't shaped with that in mind, a future
    migration could be costly — worth a light check during design, without
    building multi-user features now.
  - **Risk:** The stated scope spans academic + personal + professional life,
    note-taking, task management, third-party integrations, and voice — a classic
    scope-creep profile. V1 must stay ruthlessly focused on schedule/deadlines/
    reminders/tasks/notes + voice I/O + cross-device sync, with productivity-tool
    integrations and professional-life expansion explicitly staged for later.
  - **Open question:** What is the acceptable cost ceiling for always-on services
    this will likely depend on (voice processing, push/SMS delivery, hosting)?
    Deferred since no tech choices are being made yet, but a ceiling should be set
    before implementation begins.

## Part B — SDD-ready spec layer

> These four sections map 1:1 onto the spec schema (`templates/spec.*.yaml`). Fill them
> and run `create_spec` (kind = product|domain|api|data|infra).

### B1. Context & scope boundaries

- `in_scope:`
  - Class schedule tracking: courses, meeting patterns, locations, instructors, for
    Fall 2026 and re-seedable for future terms.
  - Assignment/deadline tracking: due dates, status, associated course, priority.
  - Proactive reminder delivery ahead of deadlines, class sessions, and appointments.
  - Ad hoc task/to-do management, not necessarily tied to a course.
  - Lightweight note-taking, linkable to a course, task, or date.
  - Natural-language interaction: voice input (speech-to-text) and voice output
    (text-to-speech), in addition to text chat.
  - A personalization/feedback loop where explicit user feedback improves future
    suggestions and reminder timing.
  - Access from at least desktop and mobile contexts, with the same account state
    visible everywhere (no single-device-only data).
  - Authentication and encryption for a single, confidential user account, with a
    data shape that does not preclude later multi-account support.

- `out_of_scope:` (v1)
  - Multi-user, shared, or household/team accounts (e.g., a collaborative version
    of the ride-plan concept from the inspiration artifact is not built now).
  - Autonomous actions with external side effects (auto-submitting assignments,
    auto-emailing, auto-registering, purchasing) taken without explicit per-action
    user confirmation.
  - Deep integrations with third-party productivity tools (calendar apps, task
    managers, LMS platforms) beyond whatever minimal import path is needed to get
    schedule data into the system.
  - Public distribution, multi-tenant operation, billing, or marketplace features.
  - Replacing systems of record the university already owns (e.g., the LMS or
    registrar) — this system organizes around them, not instead of them.

- `external_dependencies:`
  - None are committed yet; this document intentionally avoids vendor/technology
    selection. Candidate dependency *categories* to resolve in a later spec:
    speech-to-text, text-to-speech, push/notification delivery, and an optional
    schedule/calendar import source.
  - The university's academic calendar/term dates as an informational reference
    input (manually entered or imported).

- `shared_schemas:`
  - **Course** — code, name, term, meeting pattern, location, instructor.
  - **Deadline/Assignment** — linked to a Course, due date/time, status, priority.
  - **Task** — title, optional due date, status, tags.
  - **Note** — free text, optionally linked to a Course, Task, or date.
  - **Reminder** — linked to a Deadline/Task/Event, trigger time, delivery channel,
    acknowledgment state.
  - **Account** — single-tenant in v1, shaped so it is not structurally blocked
    from becoming multi-tenant later.

### B2. Deterministic state machines

**Deadline / Assignment lifecycle**
- `states:` Not Started, In Progress, Submitted, Overdue, Completed, Cancelled
- `initial:` Not Started
- `transitions:`
  - `{ from: Not Started, event: user_marks_in_progress, to: In Progress }`
  - `{ from: In Progress, event: user_marks_submitted, to: Submitted }`
  - `{ from: Not Started, event: due_date_passed_incomplete, to: Overdue }`
  - `{ from: In Progress, event: due_date_passed_incomplete, to: Overdue }`
  - `{ from: Overdue, event: user_marks_submitted, to: Submitted }`
  - `{ from: Submitted, event: user_confirms_done, to: Completed }`
  - `{ from: Not Started, event: user_cancels, to: Cancelled }`
  - `{ from: In Progress, event: user_cancels, to: Cancelled }`
- `forbidden:`
  - `{ from: Completed, to: Not Started, reason: "completed work must not silently reopen; a reopen must be its own explicit action, not an automatic transition" }`
  - `{ from: Cancelled, to: In Progress, reason: "cancelled items are terminal; the user creates a new item rather than resurrecting one" }`
  - `{ from: Overdue, to: Not Started, reason: "an overdue transition cannot be un-happened; only forward progress (Submitted) or Cancelled is valid from here" }`

**Reminder lifecycle**
- `states:` Scheduled, Delivered, Acknowledged, Dismissed, Snoozed, Expired
- `initial:` Scheduled
- `transitions:`
  - `{ from: Scheduled, event: trigger_time_reached, to: Delivered }`
  - `{ from: Delivered, event: user_acknowledges, to: Acknowledged }`
  - `{ from: Delivered, event: user_dismisses, to: Dismissed }`
  - `{ from: Delivered, event: user_snoozes, to: Snoozed }`
  - `{ from: Snoozed, event: snooze_time_reached, to: Delivered }`
  - `{ from: Delivered, event: no_response_timeout, to: Expired }`
- `forbidden:`
  - `{ from: Acknowledged, to: Scheduled, reason: "an acknowledged reminder occurrence is terminal; a new occurrence must be scheduled fresh, not rewound" }`
  - `{ from: Expired, to: Delivered, reason: "expired reminders must not silently re-fire without a new scheduling decision — protects the reminder-trust success metric" }`

### B3. Negative constraints (guardrails)

- `{ id: NC-001, message: "Never delete or silently overwrite a user's deadline, task, or note without an explicit, confirmed user action.", severity: critical }`
- `{ id: NC-002, message: "Never take an action with external-world effects (submitting, emailing, registering, purchasing) on the user's behalf without explicit per-action confirmation.", severity: critical }`
- `{ id: NC-003, message: "Never transmit or store voice or text data unencrypted, at rest or in transit.", severity: critical }`
- `{ id: NC-004, message: "Never present an inferred or guessed value (e.g., a class time or deadline) as a confirmed fact; inferred data must be visibly labeled as such.", severity: high }`
- `{ id: NC-005, message: "Never share user data with a third party beyond the minimum required to deliver an explicitly-requested feature (e.g., a chosen speech provider).", severity: critical }`
- `{ id: NC-006, message: "Never let a backlog of undelivered reminders suppress future reminders; undelivered reminders must remain visible and queryable, not silently dropped.", severity: medium }`
- `{ id: NC-007, message: "The personalization/learning loop may only adjust reminder timing, tone, or suggestions — it must never alter core factual data (deadlines, class times) based on inferred behavior.", severity: high }`

### B4. Executable acceptance criteria

- `{ id: AC-001, given: "a class schedule has been entered for the current term", when: "a class session falls within the configured reminder lead time", then: "a reminder is delivered via the user's chosen channel", invariant: "no class-session reminder is skipped unless the user has explicitly disabled reminders for that course" }`
- `{ id: AC-002, given: "an assignment has a due date", when: "the due date/time passes while status is not Submitted, Completed, or Cancelled", then: "the assignment transitions to Overdue and an overdue notification is generated", invariant: "an assignment can never remain Not Started or In Progress past its due date without being marked Overdue" }`
- `{ id: AC-003, given: "the user issues a spoken command to add a task or deadline", when: "speech-to-text successfully resolves an intent and its entities", then: "the corresponding Task/Deadline is created and the system confirms back to the user, by voice and/or text, within an agreed latency budget", invariant: "every successfully parsed voice-entry intent results in exactly one created entity — never zero, never a duplicate" }`
- `{ id: AC-004, given: "the user gives feedback (positive/negative or a correction) on a suggestion or reminder", when: "the feedback is submitted", then: "it is stored and associated with that specific suggestion/reminder instance for future personalization", invariant: "feedback is never discarded silently; if it cannot be stored, the user is notified" }`
- `{ id: AC-005, given: "the user authenticates from a new or different device", when: "authentication succeeds", then: "the same up-to-date schedule, tasks, deadlines, and notes are visible as on any other authenticated device", invariant: "no client-local-only store (e.g., a single browser's storage) may be the sole source of truth for account data, unlike the earlier HTML-artifact approach" }`

---

**Order is always: Constitution → Spec → Tests → Code.** Code is the disposable,
regenerable byproduct. If requirements change, rewrite the spec and regenerate.
