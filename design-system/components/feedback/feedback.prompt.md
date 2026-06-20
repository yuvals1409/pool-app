Feedback surfaces — toasts and empty states.

```jsx
<Toast message="Substitute saved" variant="success" onClose={dismiss} />
<EmptyState icon={<CalendarOff/>} title="No lessons this week" description="Create a lesson to generate an entry QR for the parent." action={<Button>New lesson</Button>} />
```

Toasts float bottom-center with a status accent bar. Empty states are calm and centered — short title, one line of guidance, one action.
