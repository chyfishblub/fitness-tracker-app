# APP-DESIGN-AUDIT-001 — Overall app design direction

type: fb-lane-handoff
from_workstream: design
to_workstream: product
status: ready

## Goal Alignment Session

Product Goal: Make daily meal and strength tracking low-friction, motivating, and easy to understand on a phone.
Workstream Goal: Bring the whole app up to the clarity and engagement level of the redesigned Home without losing the approachable Duolingo-inspired personality.
Lane OKR Fit: aligned
User Approval Needed: yes — approve the information architecture and visual direction before implementation.
Mini-loop Evidence: Code-level UI audit against the PRD, current Home handoff, all six signed-in views, login, and onboarding.
Evidence Against Product OKR: Six horizontally scrolling top tabs, repeated navigation concepts, and dense workout controls increase daily friction.

## Current strengths

- Clear product philosophy: Home is about today, meals are a journal, and workout progress is measurable.
- The Home redesign establishes a useful hierarchy: goal context, meals, goals, then workout.
- The rounded cards, bold Nunito type, bright feedback colors, and pressable controls feel approachable.
- Existing screens already use completion, progress, and last-session context—the right raw material for a motivating tracker.

## Main diagnosis

The app currently has two visual maturity levels. Home has a deliberate component language, while Workout, Eat, Habits, Guide, Profile, login, and onboarding are still composed mostly from one-off inline styles. The audit found 184 inline `style` attributes across `js/app.js` and `js/auth.js`, extensive 9–12px text, and a six-item horizontally scrolling top navigation. This makes the experience feel assembled screen-by-screen rather than designed as one system.

## Recommended information architecture

Replace the six scrolling top tabs with a persistent five-item bottom navigation:

| New destination | Current content |
|---|---|
| Today | Home dashboard and meal logging |
| Train | Today's workout and workout history |
| Plan | Suggested meals plus Guide content |
| Progress | Weekly habits, weight trend, and strength progress |
| Me | Account, active goal, reminders, data import, and sign out |

Use a compact top app bar for screen title, date/context, and profile/avatar. Do not repeat the active goal title and slogan above every destination.

## Visual direction

Keep the Duolingo influence, but make it feel like an adult fitness companion:

- Retain rounded geometry, tactile button depth, friendly Nunito, and celebratory progress.
- Use green as the clear primary action color, gold for current/attention, and red only for errors or destructive actions.
- Reduce the rainbow effect. Purple, blue, and orange should identify sections sparingly rather than color every large surface.
- Replace most navigation and utility emoji with one consistent SVG icon family. Keep emoji for rewards, empty states, and moments of delight.
- Use a calmer warm-neutral canvas so completed states and primary actions carry more contrast.

Suggested foundations:

- Type scale: 12 metadata, 14 body, 16 control/section label, 20 section title, 28 hero metric.
- Weight scale: 600 body, 700 controls, 900 only for key titles and metrics.
- Spacing scale: 4, 8, 12, 16, 24, 32.
- Touch targets: minimum 44×44px.
- Secondary text should be darker than the current `#AFAFAF` on white.

## Screen recommendations

### Today

- Keep the meal ring, but make the current meal action the strongest local call to action.
- Preserve snacks outside the three-meal score.
- Celebrate all-meals and all-goals completion with a brief, non-blocking animation.
- Keep the workout card prominent, but avoid repeating its progress in more than two places.

### Train

- Make today's workout the default; move week/day browsing behind a compact date control.
- Replace the cramped inline kg/reps controls with a set table: set number, previous result, kg, reps, complete.
- Use a sticky bottom action for “Start workout,” “Continue,” or “Finish workout.”
- Move Swap and Adjust behind a small overflow menu so logging remains the primary task.
- Collapse completed exercises while preserving a clear completed state.

### Plan

- Rename “Eat” to “Plan” or “Meal plan”; “Eat” currently sounds like another meal logger.
- Combine suggested meals and the Guide under a small two-option segmented control.
- Keep macros visually secondary because the product is explicitly a journal rather than a calorie tracker.

### Progress

- Merge weekly Habits, weight trend, and strength trend into one destination.
- Lead with a weekly summary, then allow drill-down by metric.
- Use empty states that tell the user what action will create the first data point.

### Me

- Keep only account, active goal, reminders, and settings.
- Put legacy import and destructive/session actions in a quieter “Advanced” section.
- Separate “Start a new goal” from the current-goal summary so it does not look like an everyday action.

### Login and onboarding

- Show one concrete value proposition instead of only the app name: log meals in seconds and know what workout is next.
- Turn onboarding into three short steps with visible progress: body goal, target, training level.
- Preview the generated plan before the final confirmation to strengthen trust.

## Interaction and accessibility

- Use inline validation and lightweight toasts instead of browser alerts for routine feedback.
- Provide loading/saving states that preserve layout and prevent duplicate actions.
- Do not rely on color alone for current, complete, or error states.
- Add consistent focus-visible styles, descriptive labels, reduced-motion support, and text containment checks.
- Keep body copy at 14px or larger; reserve 10–12px for genuinely secondary metadata.

## Recommended delivery order

1. App shell: bottom navigation, compact top bar, naming, typography, color, spacing, and reusable components.
2. Train: set-logging flow and workout navigation.
3. Plan/Progress/Me: merge duplicated destinations and restructure long pages.
4. Login/onboarding, feedback states, motion, and accessibility polish.

## Acceptance criteria

- No primary destination requires horizontal navigation scrolling at 320px width.
- A first-time user can distinguish meal logging from the suggested meal plan without explanation.
- Today and Train each have one unmistakable primary action.
- Body text is at least 14px and secondary text passes contrast checks.
- Cards, buttons, inputs, sheets, empty states, and progress indicators use shared component rules.
- Signed-in screens pass visual review at 320px, 390px, and 480px widths, plus keyboard/focus review on desktop.

## Implementation Status

Planning only. No application or source files were changed by this audit.

## Automated Checks

Read-only source audit: current screen inventory, navigation structure, inline-style count, typography sizes, and responsive patterns reviewed.

## Visual Preview Decision

browser screenshot/mockup

## Visual QA Status

pending - screenshot evidence not captured.

## Visual QA Evidence

No signed-in browser session or viewport screenshots were available during this audit.

## Remaining Visual Gates

- Capture the current signed-in app at 320px, 390px, and 480px.
- Produce an app-shell mockup showing the proposed five-item bottom navigation and compact top bar.
- Prototype the set-table workout logger before implementation approval.

## Post-Action Card Summary

- Card ID: APP-DESIGN-AUDIT-001
- Final status: design direction ready; visual preview pending
- Changed files: this handoff only
- Next owner: Product/user approval
- Live deploy: blocked until explicitly authorized

Closeout note - APP-DESIGN-AUDIT-001: design direction ready; visual preview pending. Delivered: prioritized information architecture, visual system, screen recommendations, delivery order, and acceptance criteria. Evidence: PRD and source-level UI audit. Remaining: signed-in screenshots and app-shell/workout prototypes. Handoff: docs/handoffs/APP-DESIGN-AUDIT-001.md.
