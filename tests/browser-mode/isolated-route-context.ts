import type { Browser, BrowserContext, BrowserContextOptions } from "@playwright/test";

type NewContextBrowser = Pick<Browser, "newContext">;

const OBJECT_CLOSE_ERRORS = new WeakMap<object, unknown[]>();
const PRIMITIVE_CLOSE_ERRORS = new Map<unknown, unknown[]>();
const MAX_PRIMITIVE_DIAGNOSTICS = 32;

/**
 * Returns the close errors recorded while a callback's own error was kept as
 * the primary thrown value. Returned arrays are snapshots and can be changed
 * without affecting the retained diagnostics. Object/function errors follow
 * WeakMap lifetime; primitive thrown values are retained for the 32 most
 * recent distinct keys, evicting older keys.
 */
export function getIsolatedContextCloseErrors(primaryError: unknown): readonly unknown[] {
  const errors = isObjectKey(primaryError)
    ? OBJECT_CLOSE_ERRORS.get(primaryError)
    : PRIMITIVE_CLOSE_ERRORS.get(primaryError);
  return errors ? [...errors] : [];
}

/** Run work in one fresh context and always attempt to close that context once. */
export async function withIsolatedContext<T>(
  browser: NewContextBrowser,
  options: BrowserContextOptions,
  callback: (context: BrowserContext) => T | PromiseLike<T>,
): Promise<T> {
  const context = await browser.newContext(options);
  let callbackFailed = false;
  let callbackError: unknown;

  try {
    return await callback(context);
  } catch (error) {
    callbackFailed = true;
    callbackError = error;
    throw error;
  } finally {
    try {
      await context.close();
    } catch (closeError) {
      if (callbackFailed) {
        recordCloseError(callbackError, closeError);
      } else {
        throw closeError;
      }
    }
  }
}

/** Merge descriptor defaults before scenario options and copy mutable dimensions. */
export function buildContextOptions(
  deviceDescriptor: BrowserContextOptions,
  scenarioOverrides: BrowserContextOptions = {},
): BrowserContextOptions {
  const merged = { ...deviceDescriptor, ...scenarioOverrides };
  return {
    ...merged,
    ...(merged.viewport && typeof merged.viewport === "object"
      ? { viewport: { ...merged.viewport } }
      : {}),
    ...(merged.screen && typeof merged.screen === "object" ? { screen: { ...merged.screen } } : {}),
  };
}

export function desktop1280x720ContextOptions(
  scenarioOverrides: BrowserContextOptions = {},
): BrowserContextOptions {
  return buildContextOptions({ viewport: { width: 1280, height: 720 } }, scenarioOverrides);
}

export function desktop1280x800ContextOptions(
  scenarioOverrides: BrowserContextOptions = {},
): BrowserContextOptions {
  return buildContextOptions({ viewport: { width: 1280, height: 800 } }, scenarioOverrides);
}

function isObjectKey(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function recordCloseError(primaryError: unknown, closeError: unknown): void {
  if (isObjectKey(primaryError)) {
    const errors = OBJECT_CLOSE_ERRORS.get(primaryError);
    if (errors) errors.push(closeError);
    else OBJECT_CLOSE_ERRORS.set(primaryError, [closeError]);
    return;
  }

  const errors = PRIMITIVE_CLOSE_ERRORS.get(primaryError);
  if (errors) {
    errors.push(closeError);
    return;
  }

  if (PRIMITIVE_CLOSE_ERRORS.size >= MAX_PRIMITIVE_DIAGNOSTICS) {
    const oldestKey = PRIMITIVE_CLOSE_ERRORS.keys().next().value;
    if (oldestKey !== undefined || PRIMITIVE_CLOSE_ERRORS.has(undefined)) {
      PRIMITIVE_CLOSE_ERRORS.delete(oldestKey);
    }
  }
  PRIMITIVE_CLOSE_ERRORS.set(primaryError, [closeError]);
}
