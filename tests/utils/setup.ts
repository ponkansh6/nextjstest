import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";
import { expect, afterEach, vi } from "vitest";

console.log("Setting up test environment...");

expect.extend(matchers);

// Suppress Recharts warnings
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.error = (...args: any[]) => {
  if (typeof args[0] === 'string' && (args[0].includes('The width') || args[0].includes('height'))) {
    return;
  }
  originalConsoleError(...args);
};

console.warn = (...args: any[]) => {
  if (typeof args[0] === 'string' && (args[0].includes('The width') || args[0].includes('height'))) {
    return;
  }
  originalConsoleWarn(...args);
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
