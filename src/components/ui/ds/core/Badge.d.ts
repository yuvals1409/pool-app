import * as React from "react";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Status or role tint. @default "neutral" */
  variant?:
    | "neutral" | "success" | "danger" | "warn" | "info"
    | "owner" | "admin" | "instructor" | "guard" | "office" | "parent";
  /** Show a leading status dot. @default false */
  dot?: boolean;
  children?: React.ReactNode;
}

/** Compact status / role pill with a soft warm tint. */
export function Badge(props: BadgeProps): JSX.Element;
