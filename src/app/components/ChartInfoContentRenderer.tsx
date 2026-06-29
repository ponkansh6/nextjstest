import React from "react";
import { CHART_INFO } from "@/lib/chartInfoContent";
import ChartInfoButton, {
  ChartInfoSectionHeading,
  ChartInfoList,
  ChartInfoListItem,
  ChartInfoSource,
  ChartInfoUrl,
} from "./ChartInfoButton";

interface ChartInfoContentRendererProps {
  /** Key into CHART_INFO record */
  chartKey: keyof typeof CHART_INFO;
  /** Label for the trigger button's aria-label */
  ariaLabel?: string;
  /** Optional className for the wrapper */
  className?: string;
}

export default function ChartInfoContentRenderer({
  chartKey,
  ariaLabel,
  className,
}: ChartInfoContentRendererProps) {
  const content = CHART_INFO[chartKey];
  if (!content) return null;

  return (
    <ChartInfoButton ariaLabel={ariaLabel} className={className}>
      <ChartInfoSectionHeading>データソース</ChartInfoSectionHeading>
      <ChartInfoSource>{content.source}</ChartInfoSource>
      {content.url && (
        <ChartInfoUrl href={content.url}>データ詳細へ</ChartInfoUrl>
      )}
      {content.sections.map((section, i) => (
        <React.Fragment key={i}>
          <ChartInfoSectionHeading>{section.heading}</ChartInfoSectionHeading>
          <ChartInfoList>
            {section.items.map((item, j) => (
              <ChartInfoListItem key={j}>{item}</ChartInfoListItem>
            ))}
          </ChartInfoList>
        </React.Fragment>
      ))}
    </ChartInfoButton>
  );
}