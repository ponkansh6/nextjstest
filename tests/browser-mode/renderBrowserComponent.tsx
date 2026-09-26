import type { ReactElement } from "react";
import { render, type RenderOptions } from "@testing-library/react";

type BrowserRenderOptions = Omit<RenderOptions, "wrapper">;

export function renderBrowserComponent(component: ReactElement, options?: BrowserRenderOptions) {
  return render(component, options);
}
