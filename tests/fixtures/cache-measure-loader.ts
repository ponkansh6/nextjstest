import { clearTestCache, maybeCache } from "../../server/lib/data-loader/cache";

type Phase = {
  name: "cold" | "warm" | "clear";
  calls: number;
  callsDelta: number;
  wallMs: number;
  value: unknown;
  cacheState: "miss" | "hit";
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  let underlyingCalls = 0;
  const load = maybeCache(async (key: string) => {
    underlyingCalls += 1;
    await sleep(2);
    return { key, underlyingCall: underlyingCalls };
  }, "measure-cache-loader");

  const phases: Phase[] = [];
  const run = async (name: Phase["name"], expectedDelta: number) => {
    const callsBefore = underlyingCalls;
    const started = performance.now();
    const value = await load("same-input");
    const callsDelta = underlyingCalls - callsBefore;
    if (callsDelta !== expectedDelta) {
      throw new Error(`${name} expected callsDelta=${expectedDelta}, observed ${callsDelta}`);
    }
    const cacheState = callsDelta === 0 ? "hit" : callsDelta === 1 ? "miss" : null;
    if (cacheState === null) {
      throw new Error(`${name} expected one cache lookup, observed callsDelta=${callsDelta}`);
    }
    phases.push({
      name,
      calls: underlyingCalls,
      callsDelta,
      wallMs: Number((performance.now() - started).toFixed(3)),
      value,
      cacheState,
    });
  };

  clearTestCache();
  await run("cold", 1);
  await run("warm", 0);
  clearTestCache();
  await run("clear", 1);

  const expectedCalls = [1, 1, 2];
  if (
    underlyingCalls !== expectedCalls.at(-1) ||
    phases.some((phase, index) => phase.calls !== expectedCalls[index])
  ) {
    throw new Error(
      `cache call contract violated: expected underlying calls ${expectedCalls.join(",")}, observed ${phases.map((phase) => phase.calls).join(",")}`,
    );
  }

  process.stdout.write(
    JSON.stringify({
      helper: "server/lib/data-loader/cache.ts#maybeCache",
      clearHelper: "clearTestCache",
      cacheScope: "test-only in-memory Map",
      phases,
      underlyingCalls,
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
