import { vi } from "vitest";

// テスト環境で頻繁に使われるユーティリティ・モック関数
export const setupUiMocks = () => {
  // Mock matchMedia
  Object.defineProperty(window, "matchMedia", {
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
    writable: true,
  });

  // Mock ResizeObserver
  global.ResizeObserver = class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  };

  // Mock getBoundingClientRect
  Element.prototype.getBoundingClientRect = vi.fn(() => ({
    bottom: 0,
    height: 500,
    left: 0,
    right: 0,
    toJSON: vi.fn(),
    top: 0,
    width: 1000,
    x: 0,
    y: 0,
  }));
};
