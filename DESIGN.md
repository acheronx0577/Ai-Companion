---
name: WakuWaku
description: Mint-dark AI companion chat — calm night-desk UI with a focused three-panel shell.
colors:
  canvas: "#040404"
  surface: "#0c0c0c"
  text-main: "#d4e8e8"
  text-subtle: "rgba(212, 232, 232, 0.66)"
  text-faint: "rgba(212, 232, 232, 0.58)"
  line: "rgba(212, 232, 232, 0.12)"
  chip: "rgba(4, 4, 4, 0.88)"
  focus: "#d4e8e8"
  accent-user: "rgba(143, 214, 148, 0.12)"
  accent-ai: "rgba(212, 232, 232, 0.12)"
  danger: "#ffb4b4"
  google-button-bg: "#f8f8f8"
  google-button-text: "#1f1f1f"
  google-glow: "#f5d656"
  google-glow-border: "#c9a832"
  scrollbar-track: "#0a0a0a"
  scrollbar-thumb: "rgba(212, 232, 232, 0.22)"
typography:
  display:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.2rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.04em"
  title:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "clamp(1rem, 2vw, 1.35rem)"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "0.88rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: "0.06em"
  meta:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "0.72rem"
    fontWeight: 400
    lineHeight: 1.35
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  pill: "999px"
spacing:
  xs: "0.45rem"
  sm: "0.55rem"
  md: "0.85rem"
  lg: "1.2rem"
  xl: "1.4rem"
components:
  button-primary:
    backgroundColor: "{colors.chip}"
    textColor: "{colors.text-main}"
    rounded: "{rounded.sm}"
    padding: "0.55rem 0.8rem"
  button-icon:
    backgroundColor: "{colors.chip}"
    textColor: "{colors.text-main}"
    rounded: "{rounded.sm}"
    size: "2rem"
  google-sign-in:
    backgroundColor: "{colors.google-button-bg}"
    textColor: "{colors.google-button-text}"
    rounded: "{rounded.md}"
    padding: "0.6rem 0.75rem"
  conversation-item-active:
    backgroundColor: "{colors.accent-ai}"
    textColor: "{colors.text-main}"
    rounded: "{rounded.md}"
---

## Overview

**Creative north star: The Night Desk.** WakuWaku is a late-evening companion at a dim desk — quiet, mint-tinted type on near-black surfaces, one character portrait, no dashboard clutter.

The shell is a **three-region product layout**: history sidebar (conversations + account), central chat stage (header, messages, input), and companion panel (character + voice). Motion is purposeful: sidebar width eases on desktop, content fades before collapse, mobile drawer slides from the left.

**Register:** product (utility serves chat; brand personality lives in copy and the character).

**Anti-references:** neon cyberpunk, purple gradients, glassmorphism stacks, generic “AI SaaS” card grids, bounce easing, hero metrics.

## Colors

| Token | Role | Character |
|-------|------|-----------|
| `canvas` | App background | Deep void black |
| `surface` | Sidebar / elevated panels | Slightly lifted black |
| `text-main` | Primary copy | Cool mint white |
| `text-subtle` / `text-faint` | Hints, meta, meter | Receding mint |
| `line` | Borders, dividers | Hairline mint at 12% |
| `focus` | Focus rings, active borders | Full mint (same as text-main) |
| `accent-user` / `accent-ai` | Avatar wells | Green vs mint wash |
| `danger` | Destructive actions | Soft coral text |

Google sign-in uses **external brand colors** on a light chip (`google-button-*`) — intentional exception inside the dark shell.

Use CSS variables in `static/style.css` (`:root`). Do not introduce new hex accents without updating this file.

## Typography

- **Family:** Inter with `font-display: swap`, system-ui fallback until webfont loads.
- **Display:** Uppercase “WakuWaku” sidebar title (`display` token).
- **Title:** Editable conversation title in stage header.
- **Body:** Messages, buttons, inputs (~0.86–0.88rem).
- **Label:** Section labels (“Account”, “AI Companion”, “Voice”) — uppercase, tracked.
- **Meta:** Timestamps, usage meter, conversation dates.

Hierarchy = scale + weight, not many font families. Message line length capped by bubble `max-width: 82%`.

## Elevation

Flat / tonal — **no drop shadows** on cards. Depth comes from:

- `surface` vs `canvas` contrast
- 1px `line` borders
- Slight fills: `rgba(212, 232, 232, 0.04–0.07)` on callouts and active conversation rows

Companion character sits in a bordered `character-viewer` frame, not a floating card stack.

## Components

| Component | Notes |
|-----------|--------|
| **History sidebar** | Grid: header / scroll list / footer. Collapses to 56px strip on desktop. |
| **Conversation item** | Border card; active = focus border + accent fill. |
| **Message row** | Avatar + meta line + content; user right-aligned. |
| **Auth footer** | `auth-callout` for guest; profile row + actions when signed in. |
| **Chat input** | Textarea + send/stop overlay; disabled + reduced opacity when `requires-auth`. |
| **Empty states** | Centered `message-empty` callout; guest **Sign in to chat** button with left-to-right underline on fine-pointer hover (`::after` + `scaleX`). |
| **Google sign-in** | Full-width light button; yellow `google-glow-*` spotlight when opened from empty state; disabled when OAuth not configured. |

**Motion:** `cubic-bezier(0.22, 1, 0.36, 1)` ~280–320ms for sidebar; respect `prefers-reduced-motion` (near-instant).

**Focus:** 2px `outline` using `focus` token, `outline-offset: 2px`.

## Do's and Don'ts

**Do**

- Use existing CSS variables for all new UI.
- Keep the companion panel visible on desktop; stack on narrow viewports.
- Gate chat behind Google sign-in (client + server).
- Use DOM APIs or escaped text — never inject conversation titles as HTML.
- Provide skip link, labels, and `aria-*` on interactive controls.

**Don't**

- Add purple/blue AI gradients or glass blur panels.
- Use pure `#000` / `#fff` for large surfaces (tint neutrals toward mint).
- Animate layout and opacity together on sidebar collapse (fade content first).
- Show profile image or user avatars before sign-in.
- Rely on color alone for errors (pair with copy).
