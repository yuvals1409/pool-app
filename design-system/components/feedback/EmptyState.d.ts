import * as React from "react";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Optional CTA node. */
  action?: React.ReactNode;
  style?: React.CSSProperties;
}

/** Centered empty / zero-data state with icon, message, and optional action. */
export function EmptyState(props: EmptyStateProps): JSX.Element;
