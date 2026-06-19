Use `TabBar` on mobile (≤767px) and `Sidebar` on desktop (≥768px). Both share the same `NavItem` shape.

```jsx
// Mobile
<TabBar
  tabs={[
    { id: 'schedule', label: 'לו"ז', icon: <Calendar size={22} /> },
    { id: 'scan',     label: 'סריקה', icon: <ScanLine size={22} /> },
    { id: 'admin',    label: 'ניהול', icon: <Settings size={22} /> },
  ]}
  activeId={activeTab}
  onTabChange={setActiveTab}
/>

// Desktop
<Sidebar
  logoSrc="/logo.png"
  items={navItems}
  activeId={activeTab}
  onItemChange={setActiveTab}
  user={{ name: 'יובל כהן', email: 'yuval@example.com' }}
/>
```

Icons from **lucide-react**: `Waves`, `ScanLine`, `Calendar`, `Settings`, `ClipboardList`.
Tab bar is sticky bottom with frosted glass. Sidebar is sticky inline-start on desktop.
