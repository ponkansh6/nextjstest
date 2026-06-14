import { vi } from "vitest";
import React from "react";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  BarChart: ({ children }: any) => <div className="recharts-wrapper">{children}</div>,
  AreaChart: ({ children }: any) => <div className="recharts-wrapper">{children}</div>,
  Bar: (props: any) => <div data-testid="bar-mock" data-key={props.dataKey} />,
  Area: (props: any) => <div data-testid="area-mock" data-key={props.dataKey} />,
  ReferenceLine: () => <div data-testid="reference-line-mock" />,
  Tooltip: () => <div data-testid="tooltip-mock" />,
  YAxis: () => <div data-testid="yaxis-mock" />,
  XAxis: () => <div data-testid="xaxis-mock" />,
  CartesianGrid: () => <div data-testid="grid-mock" />,
}));
