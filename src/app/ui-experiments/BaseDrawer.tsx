"use client";

import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import styles from "./base-drawer.module.css";

type DrawerContextValue = {
  hasSnapPoints: boolean;
  modal: DrawerPrimitive.Root.Props["modal"];
  swipeDirection: NonNullable<DrawerPrimitive.Root.Props["swipeDirection"]>;
};

const DrawerContext = createContext<DrawerContextValue | null>(null);

function useDrawerContext() {
  const context = useContext(DrawerContext);
  if (!context) throw new Error("DrawerContent must be used inside DrawerRoot.");
  return context;
}

export function DrawerRoot({
  modal = true,
  snapPoints,
  swipeDirection = "down",
  ...props
}: DrawerPrimitive.Root.Props) {
  const context = useMemo(
    () => ({ hasSnapPoints: Boolean(snapPoints?.length), modal, swipeDirection }),
    [modal, snapPoints, swipeDirection],
  );

  return (
    <DrawerContext.Provider value={context}>
      <DrawerPrimitive.Root
        data-slot="drawer"
        modal={modal}
        snapPoints={snapPoints}
        swipeDirection={swipeDirection}
        {...props}
      />
    </DrawerContext.Provider>
  );
}

export function DrawerTrigger(props: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

export function DrawerClose(props: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

type DrawerContentProps = Omit<DrawerPrimitive.Popup.Props, "children"> & {
  children: ReactNode;
};

export function DrawerContent({ children, className, ...props }: DrawerContentProps) {
  const { hasSnapPoints, modal, swipeDirection } = useDrawerContext();

  return (
    <DrawerPrimitive.Portal data-slot="drawer-portal">
      {modal === true && (
        <DrawerPrimitive.Backdrop
          data-slot="drawer-overlay"
          data-snap-points={hasSnapPoints ? "" : undefined}
          className={styles.overlay}
        />
      )}
      <DrawerPrimitive.Viewport
        data-slot="drawer-viewport"
        data-modal={modal}
        className={styles.viewport}
      >
        <DrawerPrimitive.Popup
          data-slot="drawer-popup"
          data-swipe-direction={swipeDirection}
          data-swipe-axis={swipeDirection === "down" || swipeDirection === "up" ? "y" : "x"}
          data-snap-points={hasSnapPoints ? "" : undefined}
          className={`${styles.popup} ${className ?? ""}`.trim()}
          {...props}
        >
          <DrawerPrimitive.Content data-slot="drawer-content" className={styles.content}>
            {children}
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </DrawerPrimitive.Portal>
  );
}

export function DrawerTitle(props: DrawerPrimitive.Title.Props) {
  return <DrawerPrimitive.Title data-slot="drawer-title" {...props} />;
}

export function DrawerDescription(props: DrawerPrimitive.Description.Props) {
  return <DrawerPrimitive.Description data-slot="drawer-description" {...props} />;
}

export function DrawerHandle() {
  return <div className={styles.handle} aria-hidden="true" />;
}
