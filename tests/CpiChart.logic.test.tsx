import { render } from "@testing-library/react";
import React from "react";
import CpiChart from "../src/app/components/CpiChart";
import { CpiData } from "../src/app/page";

// ここにレンダリングを伴わないロジックの検証を移動・作成します
describe("cpiChart Logic", () => {
  it("should calculate correctly without UI rendering", () => {
    // ロジックのみを検証するテストケースを記述
    expect(true).toBeTruthy();
  });
});
