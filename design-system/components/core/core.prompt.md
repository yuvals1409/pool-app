Core building blocks — buttons, badges, avatars, cards, form controls, toggles, segmented control, spinner. Use these for any Stream Line surface; never re-implement them inside a screen.

```jsx
<Button variant="primary" size="md">New lesson</Button>
<Badge variant="instructor" dot>Instructor</Badge>
<Avatar name="Yoav Cohen" size={32} />
<Card hover><KpiCard label="Active enrollments" value="284" delta="+12" /></Card>
<Field label="Child name" required><Input placeholder="e.g. Yoav Cohen" /></Field>
<SegmentedControl options={["Day","Week","Month"]} value="Week" onChange={setView} />
<Switch checked={on} onChange={setOn} />
```

Variants: Button — primary / secondary / ghost / danger / success / outline. Badge — status (success/danger/warn/info) + role (owner/admin/instructor/guard/office/parent). All controls read design-system tokens; pass `style` to extend, never to recolor off-brand.
