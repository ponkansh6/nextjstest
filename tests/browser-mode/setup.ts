import { cleanup } from "@testing-library/react";
import { page } from "vitest/browser";
import { afterEach, beforeEach, vi } from "vitest";
import { setBrowserTestSearchParams } from "./browser-search-params";

const DEFAULT_VIEWPORT = "__vitestBrowserDefaultViewport__" as const;
type ViewportWindow = Window & {
  [DEFAULT_VIEWPORT]?: { width: number; height: number };
};
const defaultViewport = ((window as ViewportWindow)[DEFAULT_VIEWPORT] ??= {
  width: window.innerWidth,
  height: window.innerHeight,
});

vi.mock("next/navigation", () => ({
  default: {},
  useSearchParams: () =>
    new URLSearchParams(
      (globalThis as typeof globalThis & { __VITEST_BROWSER_SEARCH_PARAMS__?: string })
        .__VITEST_BROWSER_SEARCH_PARAMS__ ?? "from=2020&to=2022",
    ),
}));

function clearScriptVisibleCookies() {
  const cookieNames = document.cookie
    .split(";")
    .map((cookie) => cookie.trim().split("=", 1)[0])
    .filter(Boolean);
  const cookiePaths = new Set(["/", window.location.pathname]);
  let path = window.location.pathname;

  while (path && path !== "/") {
    cookiePaths.add(path);
    if (!path.endsWith("/")) cookiePaths.add(`${path}/`);
    path = path.slice(0, path.lastIndexOf("/")) || "/";
  }

  for (const name of cookieNames) {
    for (const cookiePath of cookiePaths) {
      document.cookie = `${name}=; Max-Age=0; path=${cookiePath}; SameSite=Lax`;
    }
  }
}

function resetBrowserState() {
  document.body.replaceChildren();
  document.documentElement.removeAttribute("data-theme");
  window.localStorage.clear();
  clearScriptVisibleCookies();
}

beforeEach(() => {
  vi.clearAllMocks();
  resetBrowserState();
  setBrowserTestSearchParams("from=2020&to=2022");
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  resetBrowserState();
  if (
    window.innerWidth !== defaultViewport.width ||
    window.innerHeight !== defaultViewport.height
  ) {
    await page.viewport(defaultViewport.width, defaultViewport.height);
  }
});
