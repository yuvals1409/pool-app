import { CSSProperties, ReactNode } from "react";

export interface CardProps {
  children?: ReactNode;
  /** Add pool-blue tinted shadow */
  elevated?: boolean;
  /** Interior padding preset */
  padding?: "none" | "sm" | "md" | "lg";
  /** Border radius preset */
  radius?: "sm" | "md" | "card" | "xl";
  style?: CSSProperties;
}

export interface KpiCardProps {
  label: string;
  value: string | number;
  /** Use accent colour for value */
  accent?: boolean;
  style?: CSSProperties;
}

export declare function Card(props: CardProps): JSX.Element;
export declare function KpiCard(props: KpiCardProps): JSX.Element;
