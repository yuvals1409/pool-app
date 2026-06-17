import { Waves, ScanLine, Calendar, Settings, ClipboardList } from "lucide-react";

const TAB_ICON_MAP = {
  instructor: Waves,
  attendance: ClipboardList,
  guard: ScanLine,
  schedule: Calendar,
  admin: Settings,
  office: Settings,
};

export function TabIcon({ id, active = false }) {
  const Icon = TAB_ICON_MAP[id];
  if (!Icon) return null;
  return (
    <Icon
      aria-hidden
      fill={active ? "currentColor" : "none"}
      strokeWidth={active ? 1.75 : 2}
    />
  );
}
