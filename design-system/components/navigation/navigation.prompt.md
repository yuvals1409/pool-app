Workspace navigation — the flat sidebar and thin top bar that frame every admin screen.

```jsx
<Sidebar
  header={<WorkspaceHeader />}
  footer={<UserChip />}
>
  <NavItem icon={<Calendar/>} label="Schedule" active />
  <NavItem icon={<Users/>} label="Enrollments" badge="284" />
  <NavSection>Admin</NavSection>
  <NavItem icon={<BarChart/>} label="Dashboard" />
</Sidebar>

<TopBar title="Enrollments" subtitle="Summer 2026" actions={<Button>Add</Button>} />
```

Active rows use `--pool-wash` fill + pool-blue text; hover is `--surface-hover`. Group rows with `NavSection` overlines. The sidebar is flat (no shadow), separated from content by a single hairline border.
