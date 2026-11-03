import type { DriverId, TurnDriver } from "./drivers";
import { pushToTalkDriver } from "./push-to-talk-driver";
import { realtimeDriver } from "./realtime-driver";

/** Every driver that can run today; the registry run.test.ts selects from via EVAL_DRIVER. */
export const DRIVERS: Partial<Record<DriverId, TurnDriver>> = {
  pushtotalk: pushToTalkDriver,
  realtime: realtimeDriver,
};
