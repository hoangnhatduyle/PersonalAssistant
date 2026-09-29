# ECC surface for PersonalAssistant (agent-sort result)

Generated 2026-09-28 via the `agent-sort` ECC workflow, run against this repo's actual
stack (see STACK below). Everything ECC ships is still globally installed and reachable —
this file records which of it is evidence-backed as relevant to *this* repo, so the
project doesn't have to re-derive it each session. LIBRARY does not mean removed; it
means "not claimed as a daily fit for this repo."

## STACK

Next.js 16 + React 19 + TypeScript, Tailwind 4, Supabase (Postgres/RLS, 40+ migrations),
Vitest + @testing-library/react (unit), Playwright (e2e/*.spec.ts), a hand-rolled LLM
eval harness (evals/run.test.ts), Deepgram (STT) + ElevenLabs (TTS) + OpenAI (intent
resolution, knowledge_lookup RAG), Zod, React Hook Form, TanStack Query, dnd-kit,
sharp/ffmpeg, Resend, webauthn/crypto, deployed on Vercel. A `.claude/` harness_engineering
scaffold (constitution/specifications/workflows) is present. Tests use an informal
`// Traces: SPEC-ID ACx` comment convention (see `scripts/harness-gate.js`, added
2026-09-28, which now enforces this for `status: active` specs). Solo-developer project —
no Jira, no multi-tenant billing, no Docker/K8s, no non-JS/TS toolchains.

## DAILY (48 of 307)

**Agents (16/63):** a11y-architect, architect, build-error-resolver, code-reviewer,
database-reviewer, docs-lookup, e2e-runner, performance-optimizer, planner,
pr-test-analyzer, react-build-resolver, react-reviewer, security-reviewer,
silent-failure-hunter, tdd-guide, typescript-reviewer

**Skills (11/153):** backend-patterns, frontend-patterns, frontend-design, api-design,
database-migrations, postgres-patterns, e2e-testing, tdd-workflow, eval-harness,
api-connector-builder, security-review

**Commands (21/91):** build-fix, checkpoint, code-review, docs, e2e, feature-dev,
harness-audit, plan, plan-prd, pr, quality-gate, react-build, react-review, react-test,
refactor-clean, review-pr, security-scan, tdd, test-coverage, update-docs, verify

**Rules (4 of ~20 language dirs under `~/.claude/rules/ecc/`):** common, typescript, web,
react — the only rule sets this stack actually exercises.

## LIBRARY (the rest)

Dominated by: every non-TS/JS language reviewer/build-resolver (cpp/csharp/dart/django/
fastapi/flutter/fsharp/go/harmonyos/java/kotlin/pytorch/python/rust/swift and their rule
sets), unrelated industry verticals (logistics/customs/energy/healthcare-PHI/web3/trading),
content/marketing/investor-relations skills, ECC's own meta-tooling (continuous-learning-v2,
strategic-compact, skill-stocktake, configure-ecc, agent-sort itself), and multi-agent
orchestration tooling (devfleet, multi-*, orchestrate) — this repo's `.claude/worktrees/`
is empty, so there's no evidence of that workflow being in use here. Full per-item
evidence table lives in the originating chat session, not duplicated here to avoid rot;
regenerate with `/agent-sort` if the stack changes materially.

## Borderline calls (flagged by the review passes, not auto-resolved)

- `security-scan` (skill) and `cost-aware-llm-pipeline` were kept LIBRARY on the theory
  that `security-review` (DAILY) and ad hoc spend-checking cover the daily case — revisit
  if real OpenAI/Deepgram/ElevenLabs spend becomes a recurring concern.
- `coding-standards` and `verification-loop` (skills) were kept LIBRARY because this repo's
  own `.claude/constitution/coding-standards.md` and the harness_engineering MCP tools
  already claim that ground — revisit if the harness scaffold gets abandoned (see the
  low touch-rate finding below).
- `harness-audit` (command) and `plan-prd` (command) were kept DAILY on file-presence
  evidence (`.claude/specifications/`, `.claude/tests/`, `.claude/templates/PRD.md` are
  real and structured) despite most specs in this repo being `draft` or `deprecated` —
  re-review if the harness scaffold is ever dropped.

## Install plan

1. Nothing needs installing — all 307 items are already present globally in `~/.claude/`.
   This file is the *selection*, not a copy step.
2. Rules are the one real cost worth trimming: they're injected in full text (not just a
   name+description line, unlike skills/agents/commands), and currently **every** language
   rule set loads on **every** session regardless of project. Scoping that per-project
   would need either a project-local `.claude/rules/` that Claude Code prefers over the
   global set, or a smaller global set — neither is confirmed to work as a filter today
   (see Verification).
3. Optional next step: a `.claude/skills/skill-library/SKILL.md` router summarizing the
   LIBRARY set with trigger keywords, so an off-stack skill (e.g. `deep-research` for a
   one-off web lookup) is still one grep away without being in the daily listing. Not
   built yet — only build it if the 84% cut still isn't enough to make LIBRARY items easy
   to find when actually needed.

## Verification

- Confirmed: `.claude/specifications/SPEC-CORE-008.yaml` (now `status: active`) has a real
  gate now (`scripts/harness-gate.js`, pre-commit installed) — this is the one piece of
  the harness scaffold no longer purely decorative.
- **Open question, not resolved by this pass:** whether a project-local `.claude/rules/`
  actually takes precedence over (or merges with, redundantly) the global
  `~/.claude/rules/ecc/**`. If it doesn't reduce what's injected, the "84% cut" claimed
  above is real for the skills/agents/commands *listing* (which does cost tokens as
  name+description lines) but not yet real for rules (the expensive full-text one) — that
  would need a different fix, likely at the global level across all of this user's
  projects, not a per-project override.
- Not verified: whether disabling/hiding LIBRARY agents or commands via any ECC config
  flag is actually supported (no such mechanism was found in this pass) — today "LIBRARY"
  is a documented classification, not an enforced filter.
