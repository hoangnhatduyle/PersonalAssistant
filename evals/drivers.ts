import type { TurnRecord } from "./cases";
import type { EvalFixture } from "./fixture";

/**
 * A TurnDriver is one way of putting a user turn to the assistant. Every case
 * in cases.ts is graded against the same `TurnRecord` shape, so the same
 * checks can guard more than one path through the product:
 *
 *   pushtotalk -- the shipped text pipeline (`runConversationTurn`), which is
 *                 what POST /api/voice runs after transcription.
 *   realtime   -- the Realtime call path (added with the Realtime work).
 *
 * The driver owns conversation setup and cross-turn state, because how a
 * conversation carries from turn N to turn N+1 is exactly what differs between
 * the paths. `runCase` returns one record per turn; only the last is graded.
 */
export type DriverId = "pushtotalk" | "realtime";

export interface TurnDriver {
  id: DriverId;
  runCase(f: EvalFixture, turns: string[]): Promise<TurnRecord[]>;
}

export function resolveDriverIds(spec: string | undefined): DriverId[] {
  if (!spec || spec === "pushtotalk") return ["pushtotalk"];
  if (spec === "both") return ["pushtotalk", "realtime"];
  return spec.split(",").map((s) => s.trim()) as DriverId[];
}

/** Picks the drivers named by EVAL_DRIVER out of `registry`, failing loudly on one that does not exist. */
export function selectDrivers(spec: string | undefined, registry: Partial<Record<DriverId, TurnDriver>>): TurnDriver[] {
  return resolveDriverIds(spec).map((id) => {
    const driver = registry[id];
    if (!driver) throw new Error(`EVAL_DRIVER="${id}" is not available yet (registered drivers: ${Object.keys(registry).join(", ")})`);
    return driver;
  });
}
