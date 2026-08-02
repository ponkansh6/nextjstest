import React, { useMemo } from "react";
import { ReferenceLine } from "recharts";
import type { CpiData } from "@/types";
import { MILESTONE_YEARS } from "@/lib/chartConstants";

interface YearReferenceLinesProps {
  data: CpiData[];
  stroke: string;
}

/**
 * Memoized year reference lines component.
 * Replaces duplicate milestone year calculation across 6 chart components.
 */
export const YearReferenceLines: React.FC<YearReferenceLinesProps> = ({ data, stroke }) => {
  const milestones = useMemo(
    () =>
      data.filter(
        (d) =>
          d.年月.endsWith("年1月") &&
          (MILESTONE_YEARS as readonly number[]).includes(parseInt(d.年月.split("年")[0])),
      ),
    [data],
  );

  return (
    <>
      {milestones.map((d) => (
        <ReferenceLine
          key={d.年月}
          x={d.年月}
          stroke={stroke}
          strokeDasharray="3 3"
          strokeWidth={1}
          strokeOpacity={0.2}
          style={{ pointerEvents: "none" }}
        />
      ))}
    </>
  );
};
