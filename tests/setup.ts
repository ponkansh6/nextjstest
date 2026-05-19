import { expect, afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";

expect.extend(matchers);

if (typeof window !== "undefined") {
  // Mock matchMedia for JSDOM
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // Mock ResizeObserver
  global.ResizeObserver = class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  };

  // Mock getBoundingClientRect for layout-dependent components like ResponsiveContainer
  Element.prototype.getBoundingClientRect = vi.fn(() => ({
    width: 1000,
    height: 500,
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    x: 0,
    y: 0,
    toJSON: vi.fn(),
  }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
