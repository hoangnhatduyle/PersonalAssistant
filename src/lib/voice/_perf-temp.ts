// TEMPORARY diagnostic instrumentation for the /api/voice and
// /api/voice/speak latency investigation — delete this file and its call
// sites (grep for "_perf-temp") once the breakdown is diagnosed.
export async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    console.log(`[perf] ${label}: ${Date.now() - start}ms`);
  }
}
