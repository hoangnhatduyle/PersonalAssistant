# Security (project override)

> Thin override of the global Harness OS constitution `security.md`. Add only what is
> specific to THIS project; the global rules still apply. Project rules win on conflict.

## Project-specific security rules

- End-to-end encryption is a hard requirement from v1, not a hardening pass added
  later: voice and text payloads must be encrypted both at rest and in transit. This
  system is meant to be Hoang's trusted "official" assistant, holding sensitive
  academic and personal data — encryption is not optional-by-default.
- Third-party data sharing is opt-in and minimal: user data (schedule, deadlines,
  tasks, notes, voice transcripts) is never sent to a third party beyond what an
  explicitly-requested feature strictly requires (e.g., the chosen speech-to-text or
  text-to-speech provider). No resale, no analytics-driven sharing, no default-on
  integrations.

## Project negative constraints (Thou Shalt Not)

- **NC-003** — Voice or text data MUST NOT be transmitted or stored unencrypted, at
  rest or in transit. `severity: critical` · source: `SPEC-CORE-001`
- **NC-005** — User data MUST NOT be shared with a third party beyond the minimum
  required to deliver an explicitly-requested feature (e.g., a chosen speech
  provider). `severity: critical` · source: `SPEC-CORE-001`
