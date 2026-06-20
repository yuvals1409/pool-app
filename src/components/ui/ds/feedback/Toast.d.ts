import * as React from "react";

export interface ToastProps {
  message: React.ReactNode;
  /** Accent bar color. @default "info" */
  variant?: "info" | "success" | "danger" | "warn";
  /** Show a dismiss button when provided. */
  onClose?: (() => void) | null;
  style?: React.CSSProperties;
}

/** Floating notification with a status accent bar. */
export function Toast(props: ToastProps): JSX.Element;
