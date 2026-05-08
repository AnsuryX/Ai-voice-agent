---
description: "Frontend patterns for Next.js static export, real-time subscriptions, and component extraction"
applyTo: "frontend/**"
---

# Frontend Instructions

## Architecture Patterns
- Next.js 16 App Router with static export (output: 'export')
- React hooks only (useState, useEffect) for state
- Real-time Supabase subscriptions (no polling)
- CSS variables theme: --primary gold, --background dark

## Conventions
- TypeScript lenient (strict: false)
- Flexbox for layouts, CSS Grid for stats cards
- Responsive: auto-fit minmax grids
- Sidebar navigation (260px fixed) with icons + labels

## Pitfalls to Avoid
- No component modularization: extract from page.tsx to components/
- Type safety disabled: enable strict mode
- No error handling: add try-catch for database queries
- Inline styling inconsistent: use className over style objects
- No tests: consider adding test framework
- Direct frontend queries: add API layer for sensitive ops
- Missing env validation: check required vars at runtime

## Build & Test
- Dev: `npm run dev` (http://localhost:3000)
- Build: `npm run build` (static to /out)
- Lint: `npm run lint`

For project overview, see [../qatar-real-estate-bot.md](../qatar-real-estate-bot.md).