import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LazyMount } from "@/app/components/LazyMount";

type ObserverStub = {
  observe: ReturnType<typeof vi.fn>;
  unobserve: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

const observers: ObserverStub[] = [];
const originalMountFlag = Object.getOwnPropertyDescriptor(window, "__MOUNT_ALL__");
const originalIntersectionObserver = Object.getOwnPropertyDescriptor(
  globalThis,
  "IntersectionObserver",
);
const originalBoundingClientRect = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "getBoundingClientRect",
);

class NeverIntersectingObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();

  constructor(_callback: IntersectionObserverCallback) {
    observers.push(this);
  }
}

const restoreProperty = (
  target: object,
  property: PropertyKey,
  descriptor: PropertyDescriptor | undefined,
) => {
  if (descriptor) {
    Object.defineProperty(target, property, descriptor);
  } else {
    Reflect.deleteProperty(target, property);
  }
};

describe("LazyMount force-mount flag", () => {
  beforeEach(() => {
    observers.length = 0;
    Object.defineProperty(globalThis, "IntersectionObserver", {
      configurable: true,
      writable: true,
      value: NeverIntersectingObserver,
    });
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () =>
        ({
          top: window.innerHeight + 500,
          bottom: window.innerHeight + 600,
          left: 0,
          right: 100,
          width: 100,
          height: 100,
          x: 0,
          y: window.innerHeight + 500,
          toJSON: () => ({}),
        }) as DOMRect,
    });
  });

  afterEach(() => {
    cleanup();
    for (const observer of observers) {
      expect(observer.disconnect).toHaveBeenCalled();
    }
    restoreProperty(window, "__MOUNT_ALL__", originalMountFlag);
    restoreProperty(globalThis, "IntersectionObserver", originalIntersectionObserver);
    restoreProperty(HTMLElement.prototype, "getBoundingClientRect", originalBoundingClientRect);
    observers.length = 0;
  });

  it("P42-351: mounts immediately when the force flag is true", () => {
    window.__MOUNT_ALL__ = true;

    render(
      <LazyMount>
        <span data-testid="lazy-child">mounted</span>
      </LazyMount>,
    );

    expect(screen.getByTestId("lazy-child")).toBeTruthy();
    expect(observers).toHaveLength(0);
  });

  it("keeps the child unmounted when the force flag is false and nothing intersects", () => {
    window.__MOUNT_ALL__ = false;

    render(
      <LazyMount>
        <span data-testid="lazy-child">mounted</span>
      </LazyMount>,
    );

    expect(screen.queryByTestId("lazy-child")).toBeNull();
    expect(observers).toHaveLength(1);
    expect(observers[0].observe).toHaveBeenCalledOnce();
  });
});
