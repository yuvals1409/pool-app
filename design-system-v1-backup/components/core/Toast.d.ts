import { CSSProperties } from "react";

export interface ToastProps {
  message?: string;
  visible?: boolean;
  /** Use larger bottom offset when tab bar is hidden (standalone pages) */
  standalone?: boolean;
  style?: CSSProperties;
}

export declare function Toast(props: ToastProps): JSX.Element;
