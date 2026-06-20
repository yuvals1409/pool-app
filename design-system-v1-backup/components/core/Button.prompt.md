Use `Button` for any tappable action in Stream Line. It covers all 8 action types.

```jsx
<Button variant="primary" onClick={handleSave}>שמור</Button>
<Button variant="secondary" fullWidth={false} size="sm">ביטול</Button>
<Button variant="whatsapp" icon={<WhatsAppIcon />}>שלח ב-WhatsApp</Button>
<Button variant="outline">הרשמה</Button>
<Button loading>שומר...</Button>
```

**Variants:** `primary` (pool-blue gradient CTA), `secondary` (white + border), `outline` (accent border), `danger` (red), `success` (green), `ghost` (transparent), `whatsapp` (green), `google` (sign-in).
**Sizes:** `sm` (inline actions), `md` (default), `lg` / `scan` (prominent single action).
`fullWidth={false}` for inline/compact buttons. Always keep `minHeight: 44px` for tap targets.
