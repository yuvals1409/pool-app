import * as React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. @default "primary" */
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success" | "outline";
  /** @default "md" */
  size?: "sm" | "md" | "lg";
  /** Icon node rendered before the label (e.g. a Lucide icon). */
  icon?: React.ReactNode;
  /** Icon node rendered after the label. */
  iconRight?: React.ReactNode;
  /** Stretch to fill the container width. @default false */
  fullWidth?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
}

/**
 * Primary action control. Solid pool-blue primary, bordered secondary, quiet ghost.
 * @startingPoint section="Core" subtitle="Buttons — primary, secondary, ghost, danger" viewport="700x180"
 */
export function Button(props: ButtonProps): JSX.Element;
