import { CSSProperties, ReactNode } from "react";

export interface NavItem {
  id: string;
  label: string;
  icon?: ReactNode;
}

export interface SidebarUser {
  name?: string;
  email?: string;
}

export interface SidebarProps {
  logoSrc?: string;
  brandName?: string;
  items: NavItem[];
  activeId?: string;
  onItemChange?: (id: string) => void;
  user?: SidebarUser;
  style?: CSSProperties;
}

export declare function Sidebar(props: SidebarProps): JSX.Element;
