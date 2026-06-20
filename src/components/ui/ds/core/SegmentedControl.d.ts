import * as React from "react";

export interface SegmentOption {
  value: string;
  label: React.ReactNode;
}
export interface SegmentedControlProps {
  /** Options as strings or {value,label}. */
  options: Array<string | SegmentOption>;
  value: string;
  onChange?: (value: string) => void;
  /** @default "md" */
  size?: "sm" | "md";
  style?: React.CSSProperties;
}

/** Inset segmented control with a white selected pill (view/filter switch). */
export function SegmentedControl(props: SegmentedControlProps): JSX.Element;
