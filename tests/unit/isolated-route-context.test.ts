import type { Browser, BrowserContext } from "@playwright/test";
import { describe, expect, it, vi } from "vitest";
import {
  buildContextOptions,
  desktop1280x720ContextOptions,
  desktop1280x800ContextOptions,
  getIsolatedContextCloseErrors,
  withIsolatedContext,
} from "../browser-mode/isolated-route-context";

function makeContext() {
  return {
    newPage: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as BrowserContext & {
    newPage: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
}

function makeBrowser(context: BrowserContext) {
  return {
    newContext: vi.fn().mockResolvedValue(context),
  } as unknown as Pick<Browser, "newContext"> & { newContext: ReturnType<typeof vi.fn> };
}

describe("withIsolatedContext", () => {
  it("does not close when newContext rejects", async () => {
    const creationError = new Error("newContext failed");
    const newContext = vi.fn().mockRejectedValue(creationError);
    const callback = vi.fn();

    await expect(
      withIsolatedContext({ newContext } as unknown as Pick<Browser, "newContext">, {}, callback),
    ).rejects.toBe(creationError);
    expect(newContext).toHaveBeenCalledTimes(1);
    expect(callback).not.toHaveBeenCalled();
  });

  it("closes once when callback newPage rejects", async () => {
    const context = makeContext();
    const pageError = new Error("newPage failed");
    context.newPage.mockRejectedValue(pageError);
    const browser = makeBrowser(context);

    await expect(withIsolatedContext(browser, {}, (isolated) => isolated.newPage())).rejects.toBe(
      pageError,
    );
    expect(context.newPage).toHaveBeenCalledTimes(1);
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it("returns the callback result by identity and closes once", async () => {
    const context = makeContext();
    const browser = makeBrowser(context);
    const result = { exact: true };

    await expect(withIsolatedContext(browser, {}, () => result)).resolves.toBe(result);
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it("preserves callback error identity and stack and closes once", async () => {
    const context = makeContext();
    const browser = makeBrowser(context);
    const callbackError = new Error("callback failed");
    const originalStack = callbackError.stack;

    await expect(
      withIsolatedContext(browser, {}, () => {
        throw callbackError;
      }),
    ).rejects.toBe(callbackError);
    expect(callbackError.stack).toBe(originalStack);
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it("propagates a close-only rejection", async () => {
    const context = makeContext();
    const closeError = new Error("close failed");
    context.close.mockRejectedValue(closeError);

    await expect(withIsolatedContext(makeBrowser(context), {}, () => "ok")).rejects.toBe(
      closeError,
    );
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it("retains the callback error and exposes a concurrent close error", async () => {
    const context = makeContext();
    const closeError = new Error("close failed");
    context.close.mockRejectedValue(closeError);
    const callbackError = new Error("callback failed");
    const originalStack = callbackError.stack;

    await expect(
      withIsolatedContext(makeBrowser(context), {}, () => {
        throw callbackError;
      }),
    ).rejects.toBe(callbackError);
    expect(callbackError.stack).toBe(originalStack);
    expect(getIsolatedContextCloseErrors(callbackError)).toEqual([closeError]);
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it("retains primitive callback errors and accumulates close diagnostics", async () => {
    const callbackError = "primitive callback failure";
    const closeErrorA = new Error("close A failed");
    const closeErrorB = new Error("close B failed");
    const contextA = makeContext();
    const contextB = makeContext();
    contextA.close.mockRejectedValue(closeErrorA);
    contextB.close.mockRejectedValue(closeErrorB);

    await expect(
      withIsolatedContext(makeBrowser(contextA), {}, () => {
        throw callbackError;
      }),
    ).rejects.toBe(callbackError);
    await expect(
      withIsolatedContext(makeBrowser(contextB), {}, () => {
        throw callbackError;
      }),
    ).rejects.toBe(callbackError);

    expect(getIsolatedContextCloseErrors(callbackError)).toEqual([closeErrorA, closeErrorB]);
    expect(contextA.close).toHaveBeenCalledTimes(1);
    expect(contextB.close).toHaveBeenCalledTimes(1);
  });

  it("bounds primitive close diagnostics to the most recent 32 distinct keys", async () => {
    for (let index = 0; index < 33; index += 1) {
      const context = makeContext();
      context.close.mockRejectedValue(new Error(`close ${index} failed`));
      const callbackError = `bounded primitive ${index}`;
      await expect(
        withIsolatedContext(makeBrowser(context), {}, () => {
          throw callbackError;
        }),
      ).rejects.toBe(callbackError);
    }

    expect(getIsolatedContextCloseErrors("bounded primitive 0")).toEqual([]);
    expect(getIsolatedContextCloseErrors("bounded primitive 1")).toHaveLength(1);
    expect(getIsolatedContextCloseErrors("bounded primitive 32")).toHaveLength(1);
  });
});

describe("isolated context option builders", () => {
  it("merges descriptor options before scenario overrides and returns isolated dimensions", () => {
    const deviceViewport = { width: 390, height: 844 };
    const deviceScreen = { width: 390, height: 844 };
    const scenarioViewport = { width: 412, height: 915 };
    const scenarioScreen = { width: 412, height: 915 };
    const descriptor = {
      viewport: deviceViewport,
      screen: deviceScreen,
      isMobile: true,
      hasTouch: true,
      userAgent: "device-agent",
    };
    const overrides = {
      viewport: scenarioViewport,
      screen: scenarioScreen,
      userAgent: "scenario-agent",
    };

    const optionsA = buildContextOptions(descriptor, overrides);
    const optionsB = buildContextOptions(descriptor, overrides);

    expect(optionsA).toEqual({
      viewport: scenarioViewport,
      screen: scenarioScreen,
      isMobile: true,
      hasTouch: true,
      userAgent: "scenario-agent",
    });
    expect(optionsA).not.toBe(optionsB);
    expect(optionsA.viewport).not.toBe(optionsB.viewport);
    expect(optionsA.screen).not.toBe(optionsB.screen);
    expect(optionsA.viewport).not.toBe(scenarioViewport);
    expect(optionsA.screen).not.toBe(scenarioScreen);
    expect(optionsA.viewport).not.toBe(deviceViewport);
    expect(optionsA.screen).not.toBe(deviceScreen);
  });

  it("returns fresh desktop preset options with the requested viewport", () => {
    const options720A = desktop1280x720ContextOptions();
    const options720B = desktop1280x720ContextOptions();
    const options800 = desktop1280x800ContextOptions();

    expect(options720A.viewport).toEqual({ width: 1280, height: 720 });
    expect(options800.viewport).toEqual({ width: 1280, height: 800 });
    expect(options720A).not.toBe(options720B);
    expect(options720A.viewport).not.toBe(options720B.viewport);
  });
});
