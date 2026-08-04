# APP-DESIGN-SYSTEM-002 — Full app design system implementation

type: fb-lane-handoff
from_workstream: design
to_workstream: product
status: ready

## Goal Alignment Session

Product Goal: Make daily meal and strength tracking low-friction, motivating, and easy to understand on a phone.
Workstream Goal: Implement the approved app-wide design audit while preserving the existing data model and Supabase behavior.
Lane OKR Fit: aligned
User Approval Needed: no — direct one-off implementation was explicitly requested.
Mini-loop Evidence: Mobbin reference review plus dependency-free render checks across every primary destination and authentication state.
Evidence Against Product OKR: None identified

## Implemented design decisions

- Five persistent destinations: Today, Train, Plan, Progress, Me.
- Compact app bar with date and profile access.
- Adult Duolingo visual system: friendly depth and rounded geometry with calmer neutrals,
  deliberate semantic color, consistent SVG navigation icons, larger type, and stronger contrast.
- Train uses summary-first context, optional schedule browsing, a Hevy-inspired set table,
  previous values, and a sticky progress action.
- Plan combines meal suggestions and guidance; Progress combines habits and charts; Me is
  reserved for account, goal, reminder, and advanced settings.
- Login communicates product value; onboarding is a three-step personalization flow with a
  plan preview.
- Routine feedback uses in-app toasts; loading, completion, empty, focus, safe-area,
  reduced-motion, and narrow-screen states are included.

## Implementation Status

Implemented as a direct one-off. No backend, schema, migration, provider, merge, or deploy
changes were made.

## Changed files

- `js/app.js`
- `js/auth.js`
- `styles.css`
- `index.html`
- `sw.js`
- `docs/PRD.md`
- `docs/REFERENCE.md`
- `tests/ui-render.test.cjs`
- `docs/qa/APP-DESIGN-SYSTEM-002.md`
- this handoff

## Automated Checks

See `docs/qa/APP-DESIGN-SYSTEM-002.md`. All render, syntax, and diff checks pass.

## Visual Preview Decision

browser screenshot/mockup

## Visual QA Status

pending - screenshot evidence not captured.

## Visual QA Evidence

Mobbin reference screenshots were reviewed and linked in the QA artifact. No screenshot of
the implemented app was captured because the browser-control runtime was unavailable.

## Remaining Visual Gates

- Signed-in viewport screenshots at 320px, 390px, and 480px.
- Real-device sheet, keyboard, safe-area, chart, and long-text review.

## Post-Action Card Summary

- Card ID: APP-DESIGN-SYSTEM-002
- Final status: implemented; visual QA pending
- Changed files: listed above
- Next owner: Product/user visual review
- Live deploy: blocked until explicitly authorized

Closeout note - APP-DESIGN-SYSTEM-002: implemented; visual QA pending. Delivered: app shell, five-destination navigation, full screen redesign, set logger, Progress, Plan, Me, authentication, onboarding, and shared design system. Evidence: automated checks and Mobbin links in the QA artifact. Remaining: signed-in viewport and real-device visual review. Handoff: docs/handoffs/APP-DESIGN-SYSTEM-002.md.
