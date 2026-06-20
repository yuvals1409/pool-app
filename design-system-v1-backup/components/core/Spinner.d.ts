import { CSSProperties } from "react";

export interface SpinnerProps {
  /** Diameter in pixels. Default 20 */
  size?: number;
  /** Colour preset */
  color?: "accent" | "white" | "dark" | "muted";
  style?: CSSProperties;
}

export declare function Spinner(props: SpinnerProps): JSX.Element;
