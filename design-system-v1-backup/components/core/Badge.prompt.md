Use `Badge` for lesson status, enrollment state, and user roles throughout Stream Line.

```jsx
<Badge variant="active">פעיל</Badge>
<Badge variant="pending">ממתין</Badge>
<Badge variant="cancelled">בוטל</Badge>
<Badge variant="instructor">מדריך</Badge>
<Badge variant="admin">מנהל</Badge>
```

**Lesson status variants:** `active`, `pending`, `cancelled`, `used`
**Role variants:** `admin`, `owner`, `instructor`, `guard`, `office`, `parent`
**General:** `info`, `danger`, `neutral`
Rendered in `--font-mono` so numeric content aligns.
