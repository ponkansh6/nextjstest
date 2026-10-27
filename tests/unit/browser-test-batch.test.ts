import { describe, expect, it, vi } from "vitest";
import { makeTestNamePattern } from "../../scripts/browser-test-name-pattern.mjs";
import { runBrowserTestBatch } from "../../scripts/run-browser-test-batch.mjs";

function makeContext(
  results: Array<{
    testModules: Array<{ moduleId?: string; ok: () => boolean }>;
    unhandledErrors: unknown[];
  }>,
) {
  const specifications = new Map<string, { moduleId: string; testNamePattern?: RegExp }>();
  const cumulativeModules: Array<{ moduleId: string; ok: () => boolean }> = [];
  const cumulativeModuleCounts: number[] = [];
  const runOrder: string[] = [];
  const context = {
    standalone: vi.fn(async () => {}),
    getRelevantTestSpecifications: vi.fn(async ([file]: string[]) => {
      const specification = { moduleId: file, testNamePattern: undefined as RegExp | undefined };
      specifications.set(file, specification);
      return [specification];
    }),
    runTestSpecifications: vi.fn(
      async ([specification]: Array<{ moduleId: string; testNamePattern?: RegExp }>) => {
        const file = [...specifications.entries()].find(
          ([, value]) => value === specification,
        )?.[0];
        runOrder.push(file ?? "unknown");
        const result = results.shift() ?? {
          testModules: [{ ok: () => true }],
          unhandledErrors: [],
        };
        cumulativeModules.push(
          ...result.testModules.map((module) => ({ ...module, moduleId: specification.moduleId })),
        );
        cumulativeModuleCounts.push(cumulativeModules.length);
        return { ...result, testModules: [...cumulativeModules] };
      },
    ),
    close: vi.fn(async () => {}),
  };

  return { context, specifications, runOrder, cumulativeModuleCounts };
}

describe("browser test batch runner", () => {
  it("reuses one context while applying each selected file's own filter in order", async () => {
    const { context, specifications, runOrder, cumulativeModuleCounts } = makeContext([
      { testModules: [{ ok: () => true }], unhandledErrors: [] },
      { testModules: [{ ok: () => true }], unhandledErrors: [] },
    ]);
    const createContext = vi.fn(async () => context);
    const entries = [
      { file: "tests/browser-mode/first.browser.test.tsx", names: ["first suite > first case"] },
      { file: "tests/browser-mode/second.browser.test.tsx", names: ["second suite > second case"] },
    ];

    const status = await runBrowserTestBatch(
      { config: "tests/config/browser/vitest.browser.config.ts", entries },
      { createContext, reportError: vi.fn() },
    );

    expect(status).toBe(0);
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(context.standalone).toHaveBeenCalledTimes(1);
    expect(runOrder).toEqual(entries.map(({ file }) => file));
    expect(cumulativeModuleCounts).toEqual([1, 2]);
    expect(specifications.get(entries[0].file)?.testNamePattern).toEqual(
      new RegExp(makeTestNamePattern(entries[0].names)),
    );
    expect(specifications.get(entries[1].file)?.testNamePattern).toEqual(
      new RegExp(makeTestNamePattern(entries[1].names)),
    );
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it("does not start later files after a selected file fails and always closes the context", async () => {
    const { context, runOrder } = makeContext([
      { testModules: [{ ok: () => false }], unhandledErrors: [] },
      { testModules: [{ ok: () => true }], unhandledErrors: [] },
    ]);
    const entries = [
      { file: "tests/browser-mode/failing.browser.test.tsx", names: ["failure"] },
      { file: "tests/browser-mode/later.browser.test.tsx", names: ["later"] },
    ];

    const status = await runBrowserTestBatch(
      { config: "tests/config/browser/vitest.browser.config.ts", entries },
      { createContext: async () => context, reportError: vi.fn() },
    );

    expect(status).toBe(1);
    expect(runOrder).toEqual([entries[0].file]);
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it("treats context close failures as batch failures", async () => {
    const { context } = makeContext([{ testModules: [{ ok: () => true }], unhandledErrors: [] }]);
    context.close.mockRejectedValueOnce(new Error("close failed"));

    const status = await runBrowserTestBatch(
      {
        config: "tests/config/browser/vitest.browser.config.ts",
        entries: [{ file: "tests/browser-mode/only.browser.test.tsx", names: ["only"] }],
      },
      { createContext: async () => context, reportError: vi.fn() },
    );

    expect(status).toBe(1);
  });
});
