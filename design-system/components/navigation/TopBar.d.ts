import * as React from "react";

export interface TopBarProps {
  title: React.ReactNode;
  /** Inline muted subtitle next to the title. */
  subtitle?: React.ReactNode;
  /** Small breadcrumb line above the title. */
  breadcrumb?: React.ReactNode;
  /** Right-aligned action nodes (buttons, etc). */
  actions?: React.ReactNode;
  style?: React.CSSProperties;
}

/** Thin workspace header — title/breadcrumb start, actions end. */
export function TopBar(props: TopBarProps): JSX.Element;
