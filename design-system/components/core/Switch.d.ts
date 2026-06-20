import * as React from "react";

export interface SwitchProps {
  checked?: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  style?: React.CSSProperties;
}
export interface CheckboxProps {
  checked?: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  /** Optional inline label. */
  label?: React.ReactNode;
  style?: React.CSSProperties;
}

/** Pill toggle — pool-blue when on. */
export function Switch(props: SwitchProps): JSX.Element;
/** Square checkbox — pool-blue fill + check when on. */
export function Checkbox(props: CheckboxProps): JSX.Element;
