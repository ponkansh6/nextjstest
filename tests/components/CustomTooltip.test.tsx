import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CustomTooltip } from "../../src/app/components/CustomTooltip";
import { SUPPORT_SERIES_KEY_NOMINAL } from "../../src/lib/chartConstants";
import { CPI_CATEGORIES, getDisplayLabel, stackedColors } from "../../src/lib/chartConstants";
import { EARNINGS_SERIES_REGISTRY, EARNINGS_TOTAL_KEYS } from "../../src/lib/chartConstants";
import {
  formatCpiTooltipTotal,
  formatCpiTooltipValue,
} from "../../src/app/components/CustomTooltip";

const payload = [{ name: "総合", value: 112.5, color: "#1d4ed8" }];

describe("CustomTooltip", () => {
  it("renders all six registered earnings series without an omitted-payload summary", () => {
    const earnings = [
      "所定内給与",
      "所定外給与",
      "特別給与",
      "時間当たり給与",
      "15歳以上国民当たり給与",
      "CPI総合(参考)",
    ];
    render(
      <CustomTooltip
        active
        isMobile={false}
        isTouch={false}
        label="2024年1月"
        payload={earnings.map((name, value) => ({ name, dataKey: name, value }))}
        seriesMeta={earnings.map((key, order) => ({ key, label: key, order }))}
        showAllPayload
        tooltipBg="#000"
        tooltipText="#fff"
      />,
    );
    for (const name of earnings) expect(screen.getByText(name)).toBeDefined();
    expect(screen.queryByText(/他 \d+ 件/)).toBeNull();
  });

  it("separates visible salary groups at the first visible auxiliary row only", () => {
    const salaryKeys = ["所定内給与", "所定外給与", "特別給与"];
    const auxiliaryKeys = ["時間当たり給与", "15歳以上国民当たり給与", "CPI総合(参考)"];
    const metadata = [...salaryKeys, ...auxiliaryKeys].map((key, order) => ({
      key,
      label: key,
      order,
    }));
    const payload = [...salaryKeys, ...auxiliaryKeys].map((dataKey, value) => ({
      dataKey,
      name: "raw",
      value,
    }));
    const separator = { firstGroupKeys: salaryKeys, secondGroupKeys: auxiliaryKeys };
    const renderTooltip = (allowedKeys?: string[]) =>
      render(
        <CustomTooltip
          active
          isMobile={false}
          isTouch={false}
          label="2025年1月"
          payload={payload}
          seriesMeta={metadata}
          allowedKeys={allowedKeys}
          separatorBetweenGroups={separator}
          showAllPayload
          tooltipBg="#000"
          tooltipText="#fff"
        />,
      );

    let view = renderTooltip();
    expect(document.querySelectorAll('[data-tooltip-group-separator="true"]')).toHaveLength(1);
    const initialSeparator = document.querySelector('[data-tooltip-group-separator="true"]');
    expect(initialSeparator?.getAttribute("data-tooltip-key")).toBe("時間当たり給与");
    expect(initialSeparator?.className).toContain("tooltipGroupSeparator");
    view.unmount();

    view = renderTooltip(auxiliaryKeys);
    expect(document.querySelectorAll('[data-tooltip-group-separator="true"]')).toHaveLength(0);
    view.unmount();

    view = renderTooltip(salaryKeys);
    expect(document.querySelectorAll('[data-tooltip-group-separator="true"]')).toHaveLength(0);
    view.unmount();

    view = renderTooltip(["所定内給与", "特別給与", "15歳以上国民当たり給与", "CPI総合(参考)"]);
    expect(document.querySelectorAll('[data-tooltip-group-separator="true"]')).toHaveLength(1);
    expect(
      document
        .querySelector('[data-tooltip-group-separator="true"]')
        ?.getAttribute("data-tooltip-key"),
    ).toBe("15歳以上国民当たり給与");
    view.unmount();

    view = renderTooltip([...salaryKeys, "15歳以上国民当たり給与", "CPI総合(参考)"]);
    expect(document.querySelectorAll('[data-tooltip-group-separator="true"]')).toHaveLength(1);
    expect(
      document
        .querySelector('[data-tooltip-group-separator="true"]')
        ?.getAttribute("data-tooltip-key"),
    ).toBe("15歳以上国民当たり給与");
    view.unmount();

    view = renderTooltip(["特別給与", ...auxiliaryKeys]);
    expect(document.querySelectorAll('[data-tooltip-group-separator="true"]')).toHaveLength(1);
    expect(
      document
        .querySelector('[data-tooltip-group-separator="true"]')
        ?.getAttribute("data-tooltip-key"),
    ).toBe("時間当たり給与");
    view.unmount();
  });

  it("does not add a separator to CPI, consumption, or comparison rows", () => {
    render(
      <CustomTooltip
        active
        isMobile={false}
        isTouch={false}
        payload={[
          { dataKey: "CPI総合", name: "CPI総合", value: 100 },
          { dataKey: "CTI消費支出（参考）", name: "CTI消費支出（参考）", value: 101 },
          { dataKey: "総合(12MA)", name: "給与(総合)", value: 102 },
        ]}
        seriesMeta={[
          { key: "CPI総合", label: "CPI総合", order: 0 },
          { key: "CTI消費支出（参考）", label: "CTI消費支出（参考）", order: 1 },
          { key: "総合(12MA)", label: "給与(総合)", order: 2 },
        ]}
        showAllPayload
        tooltipBg="#000"
        tooltipText="#fff"
      />,
    );
    expect(document.querySelectorAll('[data-tooltip-group-separator="true"]')).toHaveLength(0);
    expect(document.querySelectorAll(".tooltipGroupSeparator")).toHaveLength(0);
  });

  it("excludes unregistered payload keys when a metadata contract is supplied", () => {
    render(
      <CustomTooltip
        active
        isMobile={false}
        isTouch={false}
        label="2024年1月"
        payload={[
          { name: "登録済み", dataKey: "registered", value: 10 },
          { name: "未登録", dataKey: "unregistered", value: 90 },
        ]}
        seriesMeta={[{ key: "registered", label: "登録済み", order: 0 }]}
        showTotal
        showAllPayload
        tooltipBg="#000"
        tooltipText="#fff"
      />,
    );
    expect(screen.getByText("登録済み")).toBeDefined();
    expect(screen.queryByText("未登録")).toBeNull();
    expect(
      within(screen.getByText("合計").parentElement as HTMLElement).getByText("10.00"),
    ).toBeDefined();
  });

  it("sums only included earnings rows and preserves missing/invalid row values", () => {
    const values = new Map<string, number | null | undefined>([
      ["所定内給与", 0],
      ["所定外給与", null],
      ["特別給与", 2.5],
      ["時間当たり給与", 100],
      ["15歳以上国民当たり給与", Number.NaN],
      ["CPI総合(参考)", Number.POSITIVE_INFINITY],
    ]);
    render(
      <CustomTooltip
        active
        isMobile={false}
        isTouch={false}
        label="2025年1月"
        payload={[...values.entries()].map(([dataKey, value]) => ({
          dataKey,
          name: "raw",
          value,
        }))}
        seriesMeta={EARNINGS_SERIES_REGISTRY.map(({ key, tooltipLabel, order }) => ({
          key,
          label: tooltipLabel ?? key,
          order,
        }))}
        showTotal
        totalLabel="給与区分合計（所定内＋所定外＋特別）"
        totalIncludedKeys={EARNINGS_TOTAL_KEYS}
        showAllPayload
        tooltipBg="#000"
        tooltipText="#fff"
      />,
    );
    expect(screen.getByText("給与区分合計（所定内＋所定外＋特別）")).toBeDefined();
    expect(
      within(
        screen.getByText("給与区分合計（所定内＋所定外＋特別）").parentElement as HTMLElement,
      ).getByText("2.50"),
    ).toBeDefined();
    // CTI raw is an independent registered series and remains visible as null
    // when the fixture omits it; it must not be replaced by the comparison line.
    expect(screen.getAllByText("—")).toHaveLength(4);
    expect(
      within(screen.getByText("所定内給与").parentElement as HTMLElement).getByText("0.00"),
    ).toBeDefined();
  });

  it("renders a payload欠落 earnings row and totals only existing finite values", () => {
    const missingKey = "所定外給与";
    const payload = EARNINGS_SERIES_REGISTRY.filter(({ key }) => key !== missingKey).map(
      ({ key }) => ({
        dataKey: key,
        name: "raw",
        value: key === "所定内給与" ? 100 : key === "特別給与" ? 2.5 : 999,
      }),
    );

    render(
      <CustomTooltip
        active
        isMobile={false}
        isTouch={false}
        label="2025年1月"
        payload={payload}
        seriesMeta={EARNINGS_SERIES_REGISTRY.map(({ key, tooltipLabel, order }) => ({
          key,
          label: tooltipLabel ?? key,
          order,
        }))}
        showTotal
        totalLabel="給与区分合計（所定内＋所定外＋特別）"
        totalIncludedKeys={EARNINGS_TOTAL_KEYS}
        showAllPayload
        tooltipBg="#000"
        tooltipText="#fff"
      />,
    );

    expect(screen.getByText(missingKey)).toBeDefined();
    expect(
      within(screen.getByText(missingKey).parentElement as HTMLElement).getByText("—"),
    ).toBeDefined();
    expect(
      within(
        screen.getByText("給与区分合計（所定内＋所定外＋特別）").parentElement as HTMLElement,
      ).getByText("102.50"),
    ).toBeDefined();
  });

  it("retains the legacy totalExcludedKeys behavior when totalIncludedKeys is omitted", () => {
    render(
      <CustomTooltip
        active
        isMobile={false}
        isTouch={false}
        payload={[
          { name: "対象", dataKey: "included", value: 10 },
          { name: "除外", dataKey: "excluded", value: 90 },
        ]}
        showTotal
        totalExcludedKeys={["excluded"]}
        tooltipBg="#000"
        tooltipText="#fff"
      />,
    );
    expect(
      within(screen.getByText("合計").parentElement as HTMLElement).getByText("10.00"),
    ).toBeDefined();
  });

  it("uses only GDP before 2018Q1 and only CTI after it for detail and total", () => {
    const gdpKey = "民間最終消費支出（参考）";
    const ctiKey = "CTI消費支出（参考）";
    const hiddenKey = "給与(12MA)";
    const payload = [
      { name: "旧GDPラベル", dataKey: gdpKey, value: 100 },
      { name: "旧CTIラベル", dataKey: ctiKey, value: 10 },
      { name: "境界外", dataKey: "outside", value: 50 },
      { name: "非表示系列", dataKey: hiddenKey, value: 25 },
    ];
    const allowedKeys = (label?: string) =>
      label === "2017Q4" ? [gdpKey, hiddenKey] : [ctiKey, hiddenKey];
    const renderBoundary = (label: string) =>
      render(
        <CustomTooltip
          active
          isMobile={false}
          isTouch={false}
          label={label}
          payload={payload}
          seriesMeta={[
            { key: gdpKey, label: "民間最終消費(総合)", color: "#38bdf8", order: 0 },
            { key: ctiKey, label: "CTI消費(総合)", color: "#2563eb", order: 1 },
          ]}
          allowedKeys={allowedKeys}
          includeUnmappedPayload
          showTotal
          showAllPayload
          tooltipBg="#000"
          tooltipText="#fff"
        />,
      );

    const legacy = renderBoundary("2017Q4");
    expect(screen.getByText("民間最終消費(総合)")).toBeDefined();
    expect(screen.queryByText("CTI消費(総合)")).toBeNull();
    expect(screen.queryByText("境界外")).toBeNull();
    expect(screen.queryByText("非表示系列")).toBeNull();
    expect(
      within(screen.getByText("合計").parentElement as HTMLElement).getByText("100.00"),
    ).toBeDefined();
    legacy.unmount();

    renderBoundary("2018Q1");
    expect(screen.getByText("CTI消費(総合)")).toBeDefined();
    expect(screen.queryByText("民間最終消費(総合)")).toBeNull();
    expect(screen.queryByText("境界外")).toBeNull();
    expect(screen.queryByText("非表示系列")).toBeNull();
    expect(
      within(screen.getByText("合計").parentElement as HTMLElement).getByText("10.00"),
    ).toBeDefined();
  });

  it("renders a close button on touch when active", () => {
    render(
      <CustomTooltip
        active
        payload={payload}
        label="2024年1月"
        isMobile
        isTouch
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
      />,
    );
    expect(screen.getByText("2024年1月")).toBeDefined();
    expect(screen.getByRole("button", { name: "閉じる" })).toBeDefined();
  });

  it("does not render a close button when isTouch is false", () => {
    render(
      <CustomTooltip
        active
        payload={payload}
        label="2024年1月"
        isMobile={false}
        isTouch={false}
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
      />,
    );
    expect(screen.queryByRole("button", { name: "閉じる" })).toBeNull();
  });

  it("does not render a close button on mobile if isTouch is false", () => {
    render(
      <CustomTooltip
        active
        payload={payload}
        label="2024年1月"
        isMobile={true}
        isTouch={false}
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
      />,
    );
    expect(screen.queryByRole("button", { name: "閉じる" })).toBeNull();
  });

  it("renders a close button on tablet landscape (isMobile=false, isTouch=true)", () => {
    render(
      <CustomTooltip
        active
        payload={payload}
        label="2024年1月"
        isMobile={false}
        isTouch={true}
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
      />,
    );
    expect(screen.getByRole("button", { name: "閉じる" })).toBeDefined();
  });

  it("calls onDismiss when close button is clicked or touchEnd", () => {
    const handleDismiss = vi.fn();
    render(
      <CustomTooltip
        active
        payload={payload}
        label="2024年1月"
        isMobile
        isTouch
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
        onDismiss={handleDismiss}
      />,
    );
    const closeBtn = screen.getByRole("button", { name: "閉じる" });
    fireEvent.click(closeBtn);
    expect(handleDismiss).toHaveBeenCalledTimes(1);

    fireEvent.touchEnd(closeBtn);
    expect(handleDismiss).toHaveBeenCalledTimes(2);
  });

  it("T1: does not render '合計' when showTotal is not provided", () => {
    const multiPayload = [
      { name: "食料", value: 100, color: "#f00" },
      { name: "住居", value: 50, color: "#0f0" },
    ];
    render(
      <CustomTooltip
        active
        payload={multiPayload}
        label="2024年1月"
        isMobile={false}
        isTouch={false}
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
      />,
    );
    expect(screen.queryByText("合計")).toBeNull();
  });

  it("T2: renders '合計' and correct sum when showTotal is true", () => {
    const multiPayload = [
      { name: "食料", value: 100.5, color: "#f00" },
      { name: "住居", value: 50.25, color: "#0f0" },
    ];
    render(
      <CustomTooltip
        active
        payload={multiPayload}
        label="2024年1月"
        isMobile={false}
        isTouch={false}
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
        showTotal={true}
      />,
    );
    expect(screen.getByText("合計")).toBeDefined();
    const totalRow = screen.getByText("合計").parentElement as HTMLElement;
    expect(within(totalRow).getByText("150.75")).toBeDefined();
  });

  it("T3: computes total from all payload items and renders every item regardless of touch state", () => {
    const multiPayload = [
      { name: "A", value: 10, color: "#1" },
      { name: "B", value: 20, color: "#2" },
      { name: "C", value: 30, color: "#3" },
      { name: "D", value: 40, color: "#4" },
      { name: "E", value: 50, color: "#5" },
      { name: "F", value: 60, color: "#6" },
    ];
    render(
      <CustomTooltip
        active
        payload={multiPayload}
        label="2024年1月"
        isMobile={true}
        isTouch={false}
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
        showTotal={true}
        showAllPayload={true}
      />,
    );
    // Total of 10+20+30+40+50+60 = 210
    expect(screen.getByText("合計")).toBeDefined();
    const totalRow = screen.getByText("合計").parentElement as HTMLElement;
    expect(within(totalRow).getByText("210.00")).toBeDefined();
    multiPayload.forEach((entry) => {
      const itemRow = screen.getByText(entry.name).parentElement as HTMLElement;
      expect(within(itemRow).getByText(entry.value.toFixed(2))).toBeDefined();
    });
    expect(screen.queryByText(/他\s*\d+\s*件/)).toBeNull();
  });

  it("T3: renders every desktop item when showAllPayload is true", () => {
    const multiPayload = [
      { name: "A", value: 10, color: "#1" },
      { name: "B", value: 20, color: "#2" },
      { name: "C", value: 30, color: "#3" },
      { name: "D", value: 40, color: "#4" },
      { name: "E", value: 50, color: "#5" },
      { name: "F", value: 60, color: "#6" },
      { name: "G", value: 70, color: "#7" },
    ];
    render(
      <CustomTooltip
        active
        payload={multiPayload}
        label="2024年1月"
        isMobile={false}
        isTouch={false}
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
        showAllPayload={true}
      />,
    );
    multiPayload.forEach(({ name }) => {
      expect(screen.getByText(name)).toBeDefined();
    });
    expect(screen.queryByText(/他\s*\d+\s*件/)).toBeNull();
  });

  it("T4: handles non-number values in payload safely by ignoring them", () => {
    const multiPayload = [
      { name: "食料", value: 100, color: "#f00" },
      { name: "無効", value: undefined as any, color: "#0f0" },
      { name: "住居", value: 50, color: "#00f" },
    ];
    render(
      <CustomTooltip
        active
        payload={multiPayload}
        label="2024年1月"
        isMobile={false}
        isTouch={false}
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
        showTotal={true}
      />,
    );
    expect(screen.getByText("合計")).toBeDefined();
    const totalRow = screen.getByText("合計").parentElement as HTMLElement;
    expect(within(totalRow).getByText("150.00")).toBeDefined();
  });

  it("Plan24: excludes GDP comparison values from the CTI total", () => {
    render(
      <CustomTooltip
        active
        payload={[
          { name: "食料", dataKey: "食料", value: 100, color: "#f00" },
          { name: "GDP", dataKey: SUPPORT_SERIES_KEY_NOMINAL, value: 200, color: "#0ff" },
        ]}
        label="2025年1月"
        isMobile={false}
        isTouch={false}
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
        showTotal
        totalExcludedKeys={[SUPPORT_SERIES_KEY_NOMINAL]}
      />,
    );

    const itemRow = screen.getByText("食料").parentElement as HTMLElement;
    expect(within(itemRow).getByText("100.00")).toBeDefined();
    expect(screen.queryByText("300.00")).toBeNull();
    const gdpRow = screen.getByText("GDP").parentElement as HTMLElement;
    expect(within(gdpRow).getByText("200.00")).toBeDefined();
  });

  it("採用: showAllPayload renders every mobile value without the collapsed remainder", () => {
    const allPayload = Array.from({ length: 7 }, (_, index) => ({
      name: `費目${index + 1}`,
      value: index + 1,
      color: "#123456",
    }));
    render(
      <CustomTooltip
        active
        payload={allPayload}
        label="2024年1月"
        isMobile
        isTouch
        showAllPayload
        tooltipBg="#000"
        tooltipText="#fff"
      />,
    );
    allPayload.forEach((entry) => {
      const itemRow = screen.getByText(entry.name).parentElement as HTMLElement;
      expect(within(itemRow).getByText(entry.value.toFixed(2))).toBeDefined();
    });
    expect(screen.queryByText(/他 \d+ 件/)).toBeNull();
  });

  it("採用: mobile tooltip has internal scrolling and safe-area-aware bottom padding", () => {
    const { container } = render(
      <CustomTooltip
        active
        payload={payload}
        label="2024年1月"
        isMobile
        isTouch
        tooltipBg="#000"
        tooltipText="#fff"
      />,
    );
    const tooltip = container.firstElementChild as HTMLElement;
    expect(tooltip.style.overflowY).toBe("auto");
    expect(tooltip.style.maxHeight).toContain("50dvh");
    expect(tooltip.style.maxHeight).toContain("env(safe-area-inset-top");
    expect(tooltip.style.maxHeight).toContain("env(safe-area-inset-bottom");
    // CSS environment variables are serialized differently across browsers.
    expect(tooltip.style.paddingBottom).toMatch(/10px/);
  });

  it("採用: mobile tooltip uses readable fee and total sizes with right-aligned values", () => {
    render(
      <CustomTooltip
        active
        payload={[{ name: "食料", value: 100, color: "#f00" }]}
        label="2024年1月"
        isMobile
        isTouch
        showTotal
        tooltipBg="#000"
        tooltipText="#fff"
      />,
    );
    expect(screen.getByText("食料").parentElement?.style.fontSize).toBe("14px");
    expect(screen.getByText("合計").parentElement?.style.fontSize).toBe("16px");
    const feeRow = screen.getByText("食料").parentElement as HTMLElement;
    expect(within(feeRow).getByText("100.00").style.textAlign).toBe("right");
  });

  it("resolves CPI rows from metadata, including missing and zero values", () => {
    render(
      <CustomTooltip
        active
        isMobile={false}
        isTouch={false}
        label="2018Q1"
        payload={[{ name: "自動名", dataKey: "住居", value: 0, color: "wrong" }]}
        seriesMeta={[
          { key: "住居", label: "住居", color: "red", order: 0 },
          { key: "外食", label: "外食", color: "blue", order: 1 },
        ]}
        showTotal
        showAllPayload
        valueFormatter={(value) => (value == null ? "—" : value.toFixed(2))}
        tooltipBg="#000"
        tooltipText="#fff"
      />,
    );
    expect(screen.getByText("住居")).toBeDefined();
    const housingRow = screen.getByText("住居").parentElement as HTMLElement;
    expect(within(housingRow).getByText("0.00")).toBeDefined();
    expect(screen.getByText("外食")).toBeDefined();
    expect(screen.getByText("—")).toBeDefined();
    expect(
      within(screen.getByText("合計").parentElement as HTMLElement).getByText("0.00"),
    ).toBeDefined();
    expect(screen.queryByText("自動名")).toBeNull();
  });

  it("renders all CPI categories in category/color/order contract and sums finite values only", () => {
    const cpiMeta = CPI_CATEGORIES.map((key, order) => ({
      key,
      label: getDisplayLabel(key),
      color: stackedColors[order],
      order,
    }));
    render(
      <CustomTooltip
        active
        isMobile={false}
        isTouch={false}
        label="2024年1月"
        payload={[
          { name: "wrong", dataKey: CPI_CATEGORIES[0], value: 0, color: "wrong" },
          { name: "wrong", dataKey: CPI_CATEGORIES[1], value: 1.25 },
          { name: "wrong", dataKey: CPI_CATEGORIES[2], value: null },
          { name: "wrong", dataKey: CPI_CATEGORIES[3], value: Number.NaN },
        ]}
        seriesMeta={cpiMeta}
        showTotal
        showAllPayload
        valueFormatter={formatCpiTooltipValue}
        totalFormatter={formatCpiTooltipTotal}
        tooltipBg="#000"
        tooltipText="#fff"
      />,
    );
    const rows = document.querySelectorAll('[data-tooltip-row="true"]');
    expect(rows).toHaveLength(CPI_CATEGORIES.length);
    rows.forEach((row, index) => {
      expect(row.getAttribute("data-tooltip-key")).toBe(CPI_CATEGORIES[index]);
      expect(row.getAttribute("data-tooltip-order")).toBe(String(index));
      expect(row.querySelector("[data-tooltip-color]")?.getAttribute("data-tooltip-color")).toBe(
        stackedColors[index],
      );
    });
    expect(screen.getByText("0.00")).toBeDefined();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(document.querySelector('[data-tooltip-total="true"]')?.textContent).toContain("1.25");
  });

  it("keeps CPI formatter units and handles inactive or missing payload rows", () => {
    expect(formatCpiTooltipValue(1.2)).toBe("1.20");
    expect(formatCpiTooltipValue(null)).toBe("—");
    expect(formatCpiTooltipValue(undefined)).toBe("—");
    expect(formatCpiTooltipValue(Number.POSITIVE_INFINITY)).toBe("—");
    expect(formatCpiTooltipTotal(12.345)).toBe("12.35");
    expect(formatCpiTooltipTotal(Number.NaN)).toBe("—");
    expect(formatCpiTooltipTotal(null)).toBe("—");
  });

  it("keeps the CPI category palette contract independent of tooltip rendering", () => {
    expect(CPI_CATEGORIES.length).toBe(12);
    expect(stackedColors).toHaveLength(CPI_CATEGORIES.length);
    expect(stackedColors.every((color) => typeof color === "string" && color.length > 0)).toBe(
      true,
    );
  });

  it.each(["2017Q4", "2018Q1"] as const)(
    "applies the Spending detail boundary at %s without changing the legend contract",
    (label) => {
      const gdpKey = "民間最終消費支出（名目）";
      const ctiKey = "食料（名目）";
      const allowedKeys = label === "2017Q4" ? [gdpKey] : [ctiKey];
      render(
        <CustomTooltip
          active
          isMobile={false}
          isTouch={false}
          label={label}
          payload={[
            { name: "誤表示GDP", dataKey: gdpKey, value: 100 },
            { name: "誤表示CTI", dataKey: ctiKey, value: 25 },
          ]}
          seriesMeta={[
            { key: gdpKey, label: "民間最終消費", color: "#aaa", order: 0 },
            { key: ctiKey, label: "食料", color: "#bbb", order: 1 },
          ]}
          allowedKeys={allowedKeys}
          showTotal
          showAllPayload
          tooltipBg="#000"
          tooltipText="#fff"
        />,
      );
      expect(screen.getByText(label)).toBeDefined();
      if (label === "2017Q4") {
        expect(screen.getByText("民間最終消費")).toBeDefined();
        expect(screen.queryByText("食料")).toBeNull();
      } else {
        expect(screen.getByText("食料")).toBeDefined();
        expect(screen.queryByText("民間最終消費")).toBeNull();
      }
      expect(
        within(screen.getByText("合計").parentElement as HTMLElement).getByText(
          label === "2017Q4" ? "100.00" : "25.00",
        ),
      ).toBeDefined();
    },
  );

  it("renders all six salary labels at 375px and 430px jsdom widths without fixed-width truncation", () => {
    // jsdom has no layout engine: viewport/clientWidth are the measurable contract here;
    // scrollWidth remains a smoke check rather than a painted browser measurement.
    for (const width of [375, 430]) {
      Object.defineProperty(document.documentElement, "clientWidth", {
        configurable: true,
        value: width,
      });
      const view = render(
        <CustomTooltip
          active
          isMobile
          isTouch={false}
          label="2024年1月"
          payload={EARNINGS_SERIES_REGISTRY.map(({ key }, order) => ({
            dataKey: key,
            name: "raw",
            value: order + 1,
          }))}
          seriesMeta={EARNINGS_SERIES_REGISTRY.map(({ key, tooltipLabel, color, order }) => ({
            key,
            label: tooltipLabel ?? key,
            color,
            order,
          }))}
          showAllPayload
          tooltipBg="#000"
          tooltipText="#fff"
        />,
      );
      const tooltip = view.container.firstElementChild as HTMLElement;
      Object.defineProperties(tooltip, {
        clientWidth: { configurable: true, value: width },
        scrollWidth: { configurable: true, value: width },
      });
      vi.spyOn(tooltip, "getBoundingClientRect").mockReturnValue({
        width,
        height: 240,
        top: 427,
        right: width,
        bottom: 667,
        left: 0,
        x: 0,
        y: 427,
        toJSON: () => ({}),
      });
      expect(tooltip.style.width).toBe("100%");
      expect(tooltip.style.overflowY).toBe("auto");
      expect(tooltip.clientWidth).toBe(width);
      expect(tooltip.scrollWidth).toBeLessThanOrEqual(tooltip.clientWidth);
      expect(tooltip.getBoundingClientRect().width).toBeLessThanOrEqual(width);
      for (const { tooltipLabel } of EARNINGS_SERIES_REGISTRY) {
        expect(screen.getByText(tooltipLabel as string)).toBeDefined();
      }
      view.unmount();
    }
  });

  it("excludes hidden CPI metadata independently from missing payload entries", () => {
    render(
      <CustomTooltip
        active
        isMobile={false}
        isTouch={false}
        label="2024年1月"
        payload={[{ name: "hidden", dataKey: "住居", value: 10 }]}
        seriesMeta={[
          { key: "住居", label: "住居", color: stackedColors[0], order: 0 },
          { key: "外食", label: "外食", color: stackedColors[10], order: 10 },
        ]}
        allowedKeys={["外食"]}
        showTotal
        showAllPayload
        valueFormatter={formatCpiTooltipValue}
        totalFormatter={formatCpiTooltipTotal}
        tooltipBg="#000"
        tooltipText="#fff"
      />,
    );
    expect(screen.queryByText("住居")).toBeNull();
    expect(screen.getByText("外食")).toBeDefined();
    expect(screen.getByText("—")).toBeDefined();
    expect(document.querySelector('[data-tooltip-total="true"]')?.textContent).toContain("0.00");
  });
});
