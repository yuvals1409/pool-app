import * as React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Apply default card padding. @default true */
  padded?: boolean;
  /** Lift border + faint shadow on hover. @default false */
  hover?: boolean;
  children?: React.ReactNode;
}

export interface KpiCardProps {
  label: string;
  /** Metric value (rendered in tabular mono). */
  value: React.ReactNode;
  /** Optional change string, e.g. "+12%". */
  delta?: string | null;
  /** Direction of delta. @default true */
  deltaUp?: boolean;
  icon?: React.ReactNode;
  style?: React.CSSProperties;
}

/** White bordered container — the primary surface shape. */
export function Card(props: CardProps): JSX.Element;
/** Dashboard metric tile with label, big mono value, and delta. */
export function KpiCard(props: KpiCardProps): JSX.Element;
