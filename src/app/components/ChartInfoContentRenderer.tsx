import React from "react";
import { CHART_INFO } from "@/lib/chartInfoContent";
import ChartInfoButton, {
  ChartInfoSectionHeading,
  ChartInfoSource,
  ChartInfoUrl,
} from "./ChartInfoButton";
import styles from "./ChartInfoButton.module.css";

interface ChartInfoContentRendererProps {
  chartKey: keyof typeof CHART_INFO;
  ariaLabel?: string;
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
      {content.url && <ChartInfoUrl href={content.url}>データ詳細へ</ChartInfoUrl>}
      {content.sections.map((section, i) => (
        <React.Fragment key={i}>
          <ChartInfoSectionHeading>{section.heading}</ChartInfoSectionHeading>
          <ul className={styles.list}>
            {section.items.map((item, j) => {
              const hasSubItems = item.subItems && item.subItems.length > 0;
              return (
                <li
                  key={j}
                  className={hasSubItems ? styles.leadItem : styles.listItem}
                >
                  <span className={hasSubItems ? styles.leadText : undefined}>
                    {item.text}
                  </span>
                  {hasSubItems && item.subItems && (
                    <ul className={styles.subList}>
                      {item.subItems.map((sub, k) => (
                        <li key={k} className={styles.subListItem}>
                          {sub}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </React.Fragment>
      ))}
    </ChartInfoButton>
  );
}
