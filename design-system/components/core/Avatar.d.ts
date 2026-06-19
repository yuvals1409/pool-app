import { CSSProperties } from "react";

export interface AvatarProps {
  /** User display name — used to generate initials */
  name?: string;
  /** Optional image URL */
  src?: string;
  /** Pixel size (width = height = border-radius circle). Default 32 */
  size?: number;
  style?: CSSProperties;
}

export declare function Avatar(props: AvatarProps): JSX.Element;
