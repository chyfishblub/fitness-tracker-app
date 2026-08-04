# APP-DESIGN-SYSTEM-002 — QA evidence

## Automated evidence

- `node tests/ui-render.test.cjs` — passed.
- `node --check js/app.js` — passed.
- `node --check js/auth.js` — passed.
- All JavaScript and service-worker files pass `node --check`.
- `git diff --check` — passed.

The UI harness verifies:

- Five bottom-navigation destinations render.
- Today, Train, Plan, Progress, and Me each render their new primary content.
- Expanded exercises render a previous/kg/reps set table and complete-set action.
- Plan switches to Guide content.
- Home workout routing resets to the current week/day.
- Login value proposition and step 1 of the three-step onboarding render.
- Narrow-screen and reduced-motion CSS rules are present.

## Mobbin reference evidence

- [Centr home/navigation](https://mobbin.com/screens/e7523bd0-c371-441a-9971-c8abf5f81578)
- [Ladder home/navigation](https://mobbin.com/screens/4f68e1bb-7f3a-4452-bcb2-e1d70c4dcc42)
- [Hevy set logger](https://mobbin.com/screens/972dd1a0-a420-43a8-8345-c7a527dd6da8)
- [Gymshark workout logger](https://mobbin.com/screens/25eebc84-2d43-4fdd-8474-2f05dea50098)
- [Cal AI progress](https://mobbin.com/screens/1c2836f3-bfa9-4d62-bb0b-1ff046f42dd7)
- [Google Fit progress](https://mobbin.com/screens/f057b93f-92b9-45e6-b867-51042d40ff1a)
- [Equinox+ personalization flow](https://mobbin.com/flows/754cee5d-c1f4-44a7-9ae9-5e09474db3a3)

## Visual QA status

pending - screenshot evidence not captured because the browser-control runtime was not
available in this session.

## Remaining visual gates

- Signed-in screenshots at 320px, 390px, and 480px.
- Keyboard/focus review of bottom navigation, exercise cards, sheets, and onboarding.
- Real-session review of Chart.js sizing after tab switches.
- Text containment with long goal and exercise names.
