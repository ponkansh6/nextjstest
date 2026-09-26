import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

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
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  resetBrowserState();
});
