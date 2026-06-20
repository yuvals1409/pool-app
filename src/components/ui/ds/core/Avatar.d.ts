import * as React from "react";

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Full name — drives initials and the deterministic fallback color. */
  name?: string;
  /** Image URL. Falls back to colored initials when absent. */
  src?: string | null;
  /** Pixel diameter. @default 32 */
  size?: number;
  /** Override the fallback background color. */
  color?: string | null;
}

/** Circular user avatar — image, or deterministic colored initials. */
export function Avatar(props: AvatarProps): JSX.Element;
