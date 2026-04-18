---
description: FilBucket logo & marks, usage rules.
---

# Logo & marks

## The mark

<div align="center">
  <img src="../.gitbook/assets/filbucket-mark.svg" alt="FilBucket mark" width="160" />
</div>

A blue bucket, Filecoin's brand hue. Dark ellipse at the top is the opening — both a literal bucket detail and a metaphorical drop zone. The `f` on the body is the Filecoin mark, carved into the bucket as structural identity, not applied as a sticker.

Source SVG: `apps/web/public/brand/filbucket-mark.svg`.

## Clear space

Leave at minimum 1/4 of the mark's width as clear space on all sides. Don't cram it against edges or other elements.

## Minimum size

- Digital: 24px tall minimum for primary use; 16px acceptable for favicons.
- Print: 8mm tall minimum.

## Color

Primary:

| | Hex | Use |
|---|---|---|
| **Filecoin Blue (light stop)** | `#3ca7ff` | logo gradient top |
| **Filecoin Blue (dark stop)** | `#0072e5` | logo gradient bottom |
| **Ink** | `#1a1817` | UI text, secondary bucket stroke |
| **Paper** | `#f7f4ee` | background, negative space on bucket body |
| **Accent (burnt sienna)** | `#b54a17` | UI call-to-action accent; **not** in the logo |

The logo must never be tinted outside the Filecoin blue family.

## Don't

- Don't recolor the bucket to coral, green, etc.
- Don't add drop shadows or glows beyond what's in the SVG.
- Don't outline-only the logo.
- Don't put the mark inside a colored circle / square badge.
- Don't skew, rotate, or stretch.
- Don't replace the `f` on the body with anything else.

## Do

- Use on warm paper (`#f7f4ee`) or any neutral off-white.
- Use on pure white when paper isn't available.
- On dark backgrounds: swap the inner `f` to `#f7f4ee` (already is); keep the bucket body blue.

## Files

- `apps/web/public/brand/filbucket-mark.svg` — master
- `apps/web/public/favicon-32.png` — browser favicon
- `apps/web/public/icon-192.png` — touch icon / manifest
- `apps/web/public/icon.svg` — identical to master; app-icon alias

## Filecoin mark

We also use the official Filecoin wordmark/glyph in the footer as a trust signal:

- `apps/web/public/brand/filecoin.svg` — official Filecoin logo

This is the only place we use Filecoin brand directly. Inside our own mark, we use Filecoin *identity* (the blue + the `f`) without reproducing the official logo.
