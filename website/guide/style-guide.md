---
title: "Style Guide"
---

# Ace Style Guide

Reference for matching the Ace website aesthetic in the app repo.

---

## Stack

- **CSS**: Tailwind CSS v4 (utility-first, no CSS modules)
- **Fonts**: Google Fonts (preconnect to `fonts.googleapis.com` and `fonts.gstatic.com`)

```html
<link
  rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Space+Grotesk:wght@400;500;600;700&display=swap"
/>
```

---

## Typography

| Role | Family | Fallbacks |
| --- | --- | --- |
| Body & headings | Space Grotesk | Segoe UI, sans-serif |
| Code, labels, brand | IBM Plex Mono | Cascadia Mono, monospace |

### Scale

| Class | Size | Typical use |
| --- | --- | --- |
| `text-xs` | 12px | Mono labels, badges, captions |
| `text-sm` | 14px | Body text, descriptions, nav links, buttons |
| `text-base` | 16px | Lead paragraphs |
| `text-2xl` | 24px | Section headings (mobile) |
| `text-3xl` | 30px | Section headings (md+) |
| `text-4xl` | 36px | Hero heading (mobile) |
| `text-5xl` | 48px | Hero heading (md+) |

### Weights

- `font-normal` (400) — body text
- `font-medium` (500) — subtle emphasis
- `font-semibold` (600) — headings, buttons, labels
- `font-bold` (700) — hero stats, strong emphasis

### Tracking & leading

- **Headings**: `letter-spacing: -0.02em` (set in base styles on h1-h4)
- **Mono labels**: `tracking-[0.12em]` to `tracking-[0.17em]`, always `uppercase`
- **Body**: `leading-relaxed` (1.625) for long-form, default `1.5` elsewhere
- **Headings**: `leading-tight` (1.25)

---

## Color Palette

### Dark sections (header, hero, CTA, footer)

| Token | Value | Use |
| --- | --- | --- |
| `bg` | `#0f172a` (slate-950) | Section background |
| `text` | `#94a3b8` (slate-400) | Body text |
| `headings` | `#f1f5f9` (slate-100) | h1-h4 |
| `muted` | `#64748b` (slate-500) | Footer headings, captions |
| `border` | slate-700 / slate-800 | Dividers, card edges |

### Light sections (features, testimonials, comparison)

| Token | Value | Use |
| --- | --- | --- |
| `bg` | `#f8fafc` (slate-50) | Section background |
| `text` | `#475569` (slate-600) | Body text |
| `headings` | `#0f172a` (slate-950) | h1-h4 |
| `muted` | `#64748b` (slate-500) | Descriptions |
| `border` | slate-100 / slate-200 | Card borders, dividers |
| `card-bg` | `#ffffff` | Cards, table rows |

### Accent — Emerald (primary)

| Token | Value | Use |
| --- | --- | --- |
| `emerald-400` | oklch(76.5% .177 163) | Mono labels on dark bg |
| `emerald-500` | oklch(69.6% .17 162) | Sparkline accents |
| `emerald-600` | oklch(59.6% .145 163) | Primary buttons, icons, logo badge, focus rings |
| `emerald-700` | oklch(50.8% .118 166) | Button hover state |
| `emerald-50` | oklch(97.9% .021 166) | Highlighted table rows |

### Accent — Amber (secondary, used sparingly)

| Token | Value | Use |
| --- | --- | --- |
| `amber-300` | oklch(87.9% .169 92) | — |
| `amber-400` | oklch(82.8% .189 84) | — |
| `amber-500` | oklch(76.9% .188 70) | Shadows, subtle tints |

### Neutral — Slate (full range in use)

```
slate-100  #f1f5f9   slate-200  #e2e8f0   slate-300  #cbd5e1
slate-400  #94a3b8   slate-500  #64748b   slate-600  #475569
slate-700  #334155   slate-800  #1e293b   slate-900  #0f172a
slate-950  ~#020617
```

---

## Buttons

### Primary

```html
<a class="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white no-underline transition hover:bg-emerald-700">
  Get Started Free
</a>
```

### Secondary (ghost/outline)

```html
<a class="rounded-lg border border-slate-600 px-5 py-2.5 text-sm font-semibold text-slate-100 no-underline transition hover:border-slate-400 hover:text-white">
  View on GitHub
</a>
```

### Small button (nav)

```html
<a class="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white no-underline transition hover:bg-emerald-700">
  Sign in
</a>
```

### Key properties

- Border radius: `rounded-lg` (8px)
- Font: `text-sm font-semibold`
- Transition: `transition` (150ms ease-out on all interactive props)
- Always `no-underline` on links styled as buttons

---

## Cards

### Feature card

```html
<article class="grid h-full gap-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
  <!-- optional screenshot with border-b border-slate-200 -->
  <div class="grid gap-2 p-4">
    <div class="flex items-center gap-2">
      <svg class="h-5 w-5 stroke-emerald-600" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">...</svg>
      <h3 class="m-0 text-sm font-semibold leading-6">Title</h3>
    </div>
    <p class="m-0 text-sm text-slate-500">Description</p>
  </div>
</article>
```

### Testimonial card

```html
<blockquote class="grid h-full gap-4 rounded-xl border border-slate-200 border-l-emerald-600 border-l-2 bg-white p-6">
  <p class="m-0 text-sm leading-relaxed text-slate-600">&ldquo;Quote&rdquo;</p>
  <footer class="mt-auto">
    <cite class="not-italic">
      <span class="block text-sm font-semibold text-slate-900">Name</span>
      <span class="block text-xs text-slate-400">Role, Company</span>
    </cite>
  </footer>
</blockquote>
```

### Shared card traits

- `rounded-xl` (12px)
- `border border-slate-200`
- `bg-white`
- Full height: `h-full` with `grid` for alignment

---

## Section Layout

### Wrapper pattern

Every full-width section uses this structure:

```html
<section class="section-band dark-section">
  <div class="section-inner">
    <!-- content -->
  </div>
</section>
```

### Component classes (defined in global.css)

```css
.section-band {
  @apply w-full py-20 px-6 md:px-12 lg:px-20;
}
.section-inner {
  @apply mx-auto w-full max-w-6xl; /* 1152px */
}
.dark-section {
  background: #0f172a;
  color: #94a3b8;
}
.dark-section h1, .dark-section h2, .dark-section h3, .dark-section h4 {
  color: #f1f5f9;
}
.light-section {
  background: #f8fafc;
  color: #475569;
}
.light-section h1, .light-section h2, .light-section h3, .light-section h4 {
  color: #0f172a;
}
```

### Content width

- Max container: `max-w-6xl` (1152px)
- Text blocks: `max-w-2xl` or `max-w-3xl` to constrain line length

---

## Grid Patterns

| Layout | Classes |
| --- | --- |
| 2-col hero | `md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]` |
| 2-col features | `md:grid-cols-2` |
| 3-col features | `md:grid-cols-2 xl:grid-cols-3` |
| 3-col testimonials | `md:grid-cols-3` |
| 4-col footer | `md:grid-cols-2 xl:grid-cols-4` |
| 4-col stats | `grid-cols-2 md:grid-cols-4` |

Gap values: `gap-4` for cards, `gap-6` for testimonials/footer, `gap-8` for hero.

---

## Breakpoints

| Name | Width | Use |
| --- | --- | --- |
| `sm` | 640px | Nav row direction |
| `md` | 768px | Grid columns, padding increase |
| `lg` | 1024px | Wider horizontal padding |
| `xl` | 1280px | 3/4-col grids |

---

## Border Radius

| Class | Value | Use |
| --- | --- | --- |
| `rounded-lg` | 8px | Buttons, logo badge |
| `rounded-xl` | 12px | Cards, image containers, tables |
| `rounded-2xl` | 16px | Large containers (rare) |
| `rounded-full` | pill | Badges, avatars |

---

## Icons

- **Style**: Stroke-based, not filled
- **Size**: `h-5 w-5` (20px)
- **Color**: `stroke-emerald-600`
- **Attributes**: `fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`
- **Accessibility**: `role="img" aria-label="Description"`

---

## Links

### Dark background

```html
<a class="text-slate-400 transition hover:text-white">Link</a>
```

### Light background

Standard text colors, no special link styling in the current design.

---

## Tables

- Container: `rounded-xl border border-slate-200 bg-white overflow-x-auto`
- Header row: `bg-slate-900 font-mono text-xs uppercase tracking-[0.07em] text-slate-300`
- Cell padding: `px-4 py-3`
- Row separator: `border-b border-slate-100`
- Highlighted rows: `bg-emerald-50` with `text-slate-700` (stronger text)
- Default rows: white bg with `text-slate-500`

---

## Branding Element

The logo mark is a monospace letter in an emerald badge:

```html
<span class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 font-mono text-xs font-bold text-white">
  A
</span>
<span class="font-mono text-xs uppercase tracking-[0.16em] text-slate-200">
  Ace
</span>
```

---

## Transitions

- **Default**: `transition` utility — 150ms, `cubic-bezier(.4, 0, .2, 1)`
- Applied to: buttons, links, any interactive color change
- No custom keyframe animations in the current design

---

## Spacing Conventions

| Context | Value |
| --- | --- |
| Section vertical padding | `py-20` (80px) |
| Section horizontal padding | `px-6` / `md:px-12` / `lg:px-20` |
| Heading to description | `mt-4` |
| Description to content | `mt-6` to `mt-8` |
| Between button group items | `gap-3` |
| Card inner padding | `p-4` (feature) / `p-6` (testimonial) |
| Footer section padding | `py-12` |

---

## Accessibility Patterns

- Skip-to-content link (sr-only, visible on focus with emerald bg)
- `aria-labelledby` on every `<section>` pointing to its heading
- `aria-label` on nav, lists, and decorative containers
- SVG icons get `role="img"` and `aria-label`
- Semantic HTML: `<article>`, `<blockquote>`, `<cite>`, `<nav>`, `<footer>`
- Images: `alt` text, `loading="lazy"`, `decoding="async"` (eager for hero)

---

## Summary of the Aesthetic

- **Dark navy + white card** alternating sections
- **Emerald as the sole accent** — buttons, icons, highlights, focus states
- **Monospace for branding** — logo, stat values, section labels, table headers
- **Minimal decoration** — no gradients, shadows, or background patterns on sections
- **Clean typography** — tight heading tracking, relaxed body text
- **Utility-only CSS** — no custom animations, no component library
