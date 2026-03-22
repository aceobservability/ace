# Ace

## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

## Figma-to-Code Rules

### Tokens
Design tokens are CSS custom properties defined in `frontend/src/style.css` under `:root`.
Tailwind CSS v4 maps these via `@theme` directives in the same file.
When implementing Figma designs, map Figma variables to these CSS custom properties.

### Color Mapping
| Figma Token | CSS Variable | Tailwind Class |
|-------------|-------------|----------------|
| Primary | `--color-primary` | `text-primary`, `bg-primary` |
| Surface | `--color-surface` | `bg-surface` |
| Surface Card | `--color-surface-container-low` | `bg-surface-container-low` |
| Surface Elevated | `--color-surface-container-high` | `bg-surface-container-high` |
| Text Primary | `--color-on-surface` | `text-on-surface` |
| Text Secondary | `--color-on-surface-variant` | `text-on-surface-variant` |

### Component Patterns
- Framework: Vue 3 Composition API with `<script setup lang="ts">`
- Styling: Hybrid of Tailwind utility classes + inline `:style` bindings for design tokens
- Icons: `lucide-vue-next` — import named icons, render with `<IconName :size="18" />`
- Charts: `vue-echarts` wrapping ECharts
- Dashboard layout: `vue3-grid-layout-next`

### Styling Approach
- Use Tailwind utilities for layout, spacing, flexbox, grid
- Use inline `:style` bindings with `var(--color-*)` for colors that reference design tokens
- Use `@layer base` in style.css for global element styles
- Animations defined as utility classes in style.css (`.animate-fade-in`, `.animate-slide-up`, etc.)

### Icon System
Icons come from `lucide-vue-next`. Import by name:
```vue
import { Activity, AlertTriangle, Home } from 'lucide-vue-next'
```
Use dynamic rendering: `<component :is="item.icon" :size="18" />`

### Asset Organization
Static assets (datasource logos, etc.) live in `frontend/src/assets/`.
SVG files are imported directly in components.

### Build & Dev
- Dev server: `npm run dev` (Vite on port 5173)
- Build: `npm run build` (vue-tsc + Vite)
- Test: `npm run test` (Vitest + happy-dom)
- Lint: `npm run lint:fix` (Biome)
