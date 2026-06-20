import * as React from "react";

export interface NavItemProps {
  icon?: React.ReactNode;
  label: React.ReactNode;
  active?: boolean;
  /** Trailing count / badge text. */
  badge?: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}
export interface SidebarProps {
  /** Workspace header (logo + name). */
  header?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  /** @default "var(--sidebar-w)" (248px) */
  width?: string | number;
  style?: React.CSSProperties;
}
export interface NavSectionProps {
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * Flat workspace sidebar — header, scrollable nav, footer.
 * @startingPoint section="Navigation" subtitle="Flat sidebar with nav rows + sections" viewport="280x560"
 */
export function Sidebar(props: SidebarProps): JSX.Element;
/** A single sidebar nav row. */
export function NavItem(props: NavItemProps): JSX.Element;
/** Overline group label between nav rows. */
export function NavSection(props: NavSectionProps): JSX.Element;
