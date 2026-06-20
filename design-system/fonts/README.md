# Fonts — IBM Plex Sans + IBM Plex Mono

Stream Line uses **IBM Plex Sans** for all UI/display text and **IBM Plex Mono**
for numeric data (times, phone numbers, IDs, statistics). These are the
product's real typefaces — the app loads them via the `@fontsource/ibm-plex-*`
npm packages.

## How they load here

`tokens/fonts.css` pulls both families from the Google Fonts CDN:

```css
@import url("https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap");
```

## Self-hosting (offline / PWA)

For an offline build, download the `.woff2` files and replace the `@import`
with local `@font-face` rules:

1. Get the files from <https://fonts.google.com/specimen/IBM+Plex+Sans> and
   <https://fonts.google.com/specimen/IBM+Plex+Mono> (or `npm i @fontsource/ibm-plex-sans @fontsource/ibm-plex-mono`).
2. Drop the woff2 files in `fonts/`.
3. Replace the `@import` in `tokens/fonts.css` with `@font-face` blocks pointing
   at the local files (weights 400/500/600/700 sans, 400/500/600 mono).

## Hebrew (RTL product surfaces)

The live product is Hebrew RTL and uses **IBM Plex Sans Hebrew** — see the
`--font-hebrew` token. Add it the same way when building Hebrew screens.
