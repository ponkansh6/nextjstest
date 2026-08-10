"use client";
import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";

declare global {
  interface Window {
    /** E2E/計測用: 全 LazyMount を即時マウントさせる強制フック */
    __MOUNT_ALL__?: boolean;
  }
}

/** 強制マウントは変化しない前提なので、購読は no-op で良い。 */
const neverChanges = () => () => {};

/** クライアントで強制マウントが要求されているか。IntersectionObserver 非対応環境も含む。 */
const getForceMount = () =>
  window.__MOUNT_ALL__ === true || typeof IntersectionObserver === "undefined";

/** サーバーでは常に false。useSyncExternalStore 経由なので hydration 不一致にならない。 */
const getServerForceMount = () => false;

export function LazyMount({
  children,
  placeholderHeight = 500,
  sectionId,
}: {
  children: React.ReactNode;
  placeholderHeight?: number;
  /** タブバー押下時、まだマウントされていないセクションへスクロールするための
   * フォールバック識別子。中身のセクションIDと同じ値を渡す(idではなくdata属性
   * にするのは、マウント後に中身のセクション本体が同じidを持つため、id重複を
   * 避けるため)。 */
  sectionId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [intersected, setIntersected] = useState(false);
  const forceMount = useSyncExternalStore(neverChanges, getForceMount, getServerForceMount);

  useEffect(() => {
    if (forceMount) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIntersected(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [forceMount]);

  const visible = forceMount || intersected;

  return (
    <div
      ref={ref}
      data-lazy-section={sectionId}
      style={{
        minHeight: visible ? undefined : placeholderHeight,
        scrollMarginTop: "5rem",
      }}
    >
      {visible ? children : null}
    </div>
  );
}
