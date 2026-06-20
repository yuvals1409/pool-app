# Self-Hosting Fonts — Stream Line

For a true offline PWA, host the brand fonts locally instead of loading from the Google Fonts CDN.

## Fonts used

| Family | Weights | Role |
|---|---|---|
| **IBM Plex Sans Hebrew** | 400, 500, 600, 700 | All Hebrew + Latin UI text |
| **IBM Plex Mono** | 400, 600 | Times, phone numbers, IDs, numeric data |

## Steps

1. **Download the woff2 files** from one of:
   - [Google Fonts — IBM Plex Sans Hebrew](https://fonts.google.com/specimen/IBM+Plex+Sans+Hebrew)
   - [Google Fonts — IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono)
   - [google-webfonts-helper](https://gwfh.mranftl.com/fonts) (easiest — pick weights, download woff2 zip)
   - npm: `@fontsource/ibm-plex-sans-hebrew` and `@fontsource/ibm-plex-mono`

2. **Place them in this folder** with these exact names (referenced by `tokens/typography.css`):

   ```
   fonts/
   ├── IBMPlexSansHebrew-Regular.woff2    (400)
   ├── IBMPlexSansHebrew-Medium.woff2     (500)
   ├── IBMPlexSansHebrew-SemiBold.woff2   (600)
   ├── IBMPlexSansHebrew-Bold.woff2       (700)
   ├── IBMPlexMono-Regular.woff2          (400)
   └── IBMPlexMono-SemiBold.woff2         (600)
   ```

3. **In `tokens/typography.css`:**
   - Uncomment the `@font-face` block.
   - Remove (or keep as last-resort fallback) the `@import url("https://fonts.googleapis.com…")` line.

That's it — the `--font-body`, `--font-hebrew`, and `--font-mono` tokens already point at these family names.

> **Note:** the `@font-face` rules use `local()` first, so if a visitor already has IBM Plex installed it is used with zero download; otherwise the self-hosted woff2 loads.
