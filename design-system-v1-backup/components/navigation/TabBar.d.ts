import { CSSProperties, ReactNode } from "react";

export interface TabItem {
  id: string;
  label: string;
  icon?: ReactNode;
}

export interface TabBarProps {
  tabs: TabItem[];
  activeId?: string;
  onTabChange?: (id: string) => void;
  style?: CSSProperties;
}

export declare function TabBar(props: TabBarProps): JSX.Element;
