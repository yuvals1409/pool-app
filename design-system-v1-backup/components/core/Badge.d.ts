import { CSSProperties, ReactNode } from "react";

export interface BadgeProps {
  children?: ReactNode;
  /** Semantic colour preset */
  variant?: "active" | "pending" | "cancelled" | "used" | "danger" | "info"
          | "admin" | "owner" | "instructor" | "guard" | "office" | "parent" | "neutral";
  style?: CSSProperties;
}

export declare function Badge(props: BadgeProps): JSX.Element;
