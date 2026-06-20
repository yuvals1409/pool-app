import * as React from "react";

export interface SpinnerProps {
  /** Pixel diameter. @default 20 */
  size?: number;
  /** Ring color. @default "var(--pool)" */
  color?: string;
  style?: React.CSSProperties;
}

/** Indeterminate loading spinner. */
export function Spinner(props: SpinnerProps): JSX.Element;
