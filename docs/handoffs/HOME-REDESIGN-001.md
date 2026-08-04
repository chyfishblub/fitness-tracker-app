# HOME-REDESIGN-001 — Daily Home dashboard

type: fb-lane-handoff
from_workstream: design
to_workstream: product
status: ready

## Goal Alignment Session

Product Goal: Make Home answer what the user needs to do today.
Workstream Goal: Put meal logging first, make daily progress visible, and provide one-tap access to today's workout.
Lane OKR Fit: aligned
User Approval Needed: no — the interaction rules and one-off direct implementation were approved in chat.
Mini-loop Evidence: Render-level assertions verify three meal segments, six goals, the snack action, and both today-workout routes.
Evidence Against Product OKR: None identified

## Design decisions

- Compact active-goal line replaces the large countdown card.
- Breakfast, lunch, and dinner form three interactive ring segments; logged meals are green and the current meal window is gold.
- Snacks remain independent of the 0/3 meal total.
- Daily progress contains the existing five habits and a sixth workout goal.
- Workout completion is derived from logged sets and is not manually checkable.
- Both the workout goal and final workout card open the current week/day, regardless of the user's previously viewed workout.
- Existing Duolingo palette is retained with more expressive progress, depth, and card hierarchy.

## Implementation Status

Implemented in `js/app.js` and `styles.css`. Product documentation and the service-worker cache version were updated.

## Automated Checks

- `node --check js/app.js` — passed.
- `node --check sw.js` — passed.
- `git diff --check` — passed.
- VM render assertions for meal segments, daily-goal count, snack action, workout routing, and derived workout state — passed.

## Visual Preview Decision

browser screenshot/mockup

## Visual QA Status

pending — screenshot evidence not captured because the in-app browser control surface was unavailable in this session.

## Visual QA Evidence

No viewport screenshot captured. Static responsive rules cover the primary phone layout and a narrow layout at 350px and below.

## Remaining Visual Gates

- Capture and review signed-in Home at 320px, 390px, and 480px widths.
- Confirm ring-segment tapping, meal-sheet presentation, long goal-title containment, and the direct workout transition on a real session.

## Post-Action Card Summary

- Card ID: HOME-REDESIGN-001
- Final status: implemented; visual QA pending
- Changed files: `js/app.js`, `styles.css`, `docs/PRD.md`, `docs/REFERENCE.md`, `sw.js`, this handoff
- Next owner: Product/user visual review
- Live deploy: blocked until explicitly authorized

Closeout note - HOME-REDESIGN-001: implemented with visual QA pending. Delivered: reordered Home, meal ring, six daily goals, and direct current-day workout routing. Evidence: automated checks above. Remaining: signed-in viewport screenshots and interaction review. Handoff: docs/handoffs/HOME-REDESIGN-001.md.
