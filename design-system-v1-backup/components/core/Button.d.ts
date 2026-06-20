import { CSSProperties, ReactNode } from "react";

/**
 * @startingPoint section="Components" subtitle="Full-width primary action button" viewport="375x80"
 */
export interface ButtonProps {
  /** Button label */
  children?: ReactNode;
  /** Visual style */
  variant?: "primary" | "secondary" | "outline" | "danger" | "success" | "ghost" | "whatsapp" | "google";
  /** Size preset */
  size?: "sm" | "md" | "lg" | "scan";
  /** Fill container width (default true) */
  fullWidth?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Show loading spinner */
  loading?: boolean;
  /** Leading icon element */
  icon?: ReactNode;
  /** Click handler */
  onClick?: () => void;
  /** HTML button type */
  type?: "button" | "submit" | "reset";
  /** Extra inline styles */
  style?: CSSProperties;
}

export declare function Button(props: ButtonProps): JSX.Element;
