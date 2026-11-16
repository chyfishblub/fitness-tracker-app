# Juno — Step 1: The user problem

**Status:** draft for review · **Date:** 2026-11-13 · **Owner:** Fish
**Redesign plan:** step 1 of 5 (problem → brand → design system → core screens → cases)

Juno is the new name for the app previously called "Fitness Tracker". This document defines
who Juno is for and what problem it solves, before any brand or visual decisions. Everything
marked **Assumption** still needs testing.

---

## 1. Where we start

### Fish's story (from `docs/PRD.md`)

Fish trains at a gym, runs a calorie deficit, and set a concrete goal: look lean for a Phuket
trip. The first version of the app was a personal PWA whose data lived in one browser. Fish
asked for five things:

- An account, so progress isn't stuck on one device.
- A photo-first food journal that shows what is actually eaten, without counting calories.
- Honest training logs, with weight and reps for every set.
- Structure that bends, so exercises can be swapped as Fish moves from beginner to
  intermediate.
- A Today screen that only shows what matters right now.

When asked what they would pay for, Fish named AI meal-photo analysis and a coach who keeps
them accountable.

### What our own history shows

- **The app went quiet.** Supabase paused the project on its own, which happens after at
  least a week with no activity. Last activity was early August. On 2026-11-10 the app was
  unreachable. The most motivated user possible also stopped opening the app. **Assumption:**
  this reflects a lapse in Fish's habit, not only a pause in development. To confirm with Fish.
- **Data trust matters.** Guest data is tied to one browser. Clearing Safari can lose it for
  good, which is exactly the "stuck on one device" problem Fish started with.
- **The look kept changing.** The app has gone through a green Duolingo-style skin, the
  Elemental Gradient system, and two coach styles. That is a sign the product's story was
  never written down.

---

## 2. Who Juno is for

**Audience: "people like Fish".** Adults who train at a gym, or want to, and who:

- have a goal right now, such as an event, a trip, or getting stronger;
- want to eat better but won't count calories;
- have started a routine or an app before and dropped it.

**Assumption:** this group is large and underserved. Calorie trackers serve people who will
weigh food, and workout loggers serve people who already train consistently. The person in
between, motivated but not yet consistent, has the most to gain and is the one apps lose first.

### Proto-personas (assumptions, not research)

**The event restarter.** This is Fish's pattern. A dated goal, such as a trip, wedding or
race, creates strong motivation. Logging is daily for the first weeks. Then a busy week or a
missed session breaks the chain, and the goal date arrives with nothing planned after it.
Each new goal starts from zero.

**The quiet builder.** No deadline, just "get stronger". Trains three times a week and
cares about the numbers going up. The risk is boredom and plateau: the same template for
months, with progress too slow to notice.

---

## 3. What the research says

| Finding | Evidence | What it means for Juno |
|---|---|---|
| Most people leave fitness apps within a month. | Health and fitness apps keep roughly 3% to 9% of users at day 30, depending on how it's measured. | The first month decides everything. Value has to be felt in week one, not week eight. |
| Most new gym members quit within three months. | A study of one fitness center found 63% stopped before month three, and under 4% still trained a year later. | Juno's audience is already the group most likely to stop. Retention is the product. |
| Habits take about two months, and vary widely. | In Lally's study, the average time to automaticity was 66 days, ranging from 18 to an estimated 254. One missed day had little effect; frequent inconsistency did. | Missing one day is normal and harmless. Juno should protect consistency over weeks, not perfection every day. |
| People stop tracking because it's boring, effortful, or pointless. | Studies of former tracker users name boredom, the hassle of tracking, and failing to link data to behavior. Many felt guilty and wanted to resume. Many returned later. | Logging must be quick and pay off visibly. Leaving and coming back is a normal path to design for. |
| One slip often becomes a stop. | The "what-the-hell effect": after people believe they've broken a rule, they lapse further. The belief of failure matters more than the size of the slip. Self-compassion after a lapse is linked to better recovery. | Streaks that break, red marks and "you failed" copy all create the belief of failure. Juno has to make slips feel small. |
| Logging regularly matters more than the method. | In a photo-versus-calorie-app trial, both groups lost weight, and logging on more than 60% of days was the strongest factor. Photo logs were not easier to sustain in every group. | A photo journal is fine, but it only works if it's frequent and quick. Speed matters more than richness. |

---

## 4. The problem

**People like Fish start strong with a clear goal, then lose the habit in the gap between
motivation and automaticity. Logging feels like a chore before it feels useful, a missed day
feels like failure, and when the goal ends there is nothing to keep going for.**

### Top three problems

1. **Logging costs more than it seems to give back, especially in the first two months.**
   Each meal photo and set entry is effort now, while the reward, visible change, arrives
   much later.
2. **A slip turns into a stop.** A missed day or a heavy meal reads as failure. Guilt makes
   reopening the app feel worse, so people stay away longer.
3. **Progress is invisible, then the goal disappears.** Weight is noisy day to day and
   strength gains are slow. When the event date passes, the plan ends and so does the reason
   to show up.

A fourth problem underlies all three: **trust in the data.** If logs can vanish with a
browser, every past effort feels at risk.

---

## 5. Jobs to be done

- When I have a goal coming up, I want to know exactly what to do today, so I don't waste
  energy deciding.
- When I eat, I want to capture it in seconds, so I can see my patterns without counting.
- When I train, I want to see what I did last time, so I know what to beat.
- When I miss a day or a week, I want to pick up where I left off, without feeling judged.
- When my goal ends, I want a natural next goal, so my progress keeps going.
- When I look back, I want proof that I'm getting stronger and more consistent.

---

## 6. Moments the habit breaks

| Moment | What usually happens | What Juno should do (direction, not design) |
|---|---|---|
| Week 2–3, novelty fades | Logging feels repetitive and the reward is far off. | Show a small, true win every week, such as sets logged or a heavier lift. |
| A busy day | No time to log meals or train. | Make the minimum log tiny, like one photo, and treat a partial day as a good day. |
| A missed workout | The plan now looks "behind". | Move the plan forward quietly. Never show a debt to repay. |
| Two or more quiet days | Guilt builds and reopening feels bad. | Welcome back plainly, keep all history, offer the easiest next step. |
| An indulgent meal | It feels like the diet is broken. | Log it like any other meal. No scores, no red. |
| A plateau | The numbers stall and boredom sets in. | Suggest a swap or a small change, and point to consistency gains instead. |
| The goal date passes | The plan ends and so does the purpose. | Celebrate what happened, then offer the next goal built on current numbers. |
| A new phone or a cleared browser | Data seems lost and trust breaks. | Make the data's safety visible, and make moving from guest to account easy. |

---

## 7. What Juno must never do

Carried from the PRD principles and the research above:

- Never shame, score or color a meal. A photo and a note is a complete log.
- Never require calories or macros.
- Never make a missed day look like a broken streak or a debt.
- Never lock logging to a time window. Backfilling is always allowed.
- Never sell recovery, such as paid streak repair.
- Never infer mood, body image, injury or food quality from logs.
- Never lose a user's history silently.

---

## 8. Assumptions to test, cheaply

| Assumption | Cheap test |
|---|---|
| Fish's own habit lapsed after August, not just development. | Ask Fish directly, and check the last logged meal and set dates in Supabase. |
| The event restarter is a common pattern beyond Fish. | Ask five gym-going friends how their last goal ended and what came after. |
| A tiny minimum log keeps people coming back on busy days. | Fish uses a one-tap log for two weeks and notes the busy days that still count. |
| Weekly small wins feel more motivating than streaks. | Show Fish two versions of a weekly recap and ask which one makes reopening easier. |
| People want the next goal suggested when one ends. | When Fish's next goal ends, offer a pre-filled next goal and see whether it's accepted. |
| Data safety affects trust. | Ask five people whether they would use a guest mode that lives in one browser. |

---

## 9. How we'll know it works (for later)

- Share of days with at least one log during the first eight weeks.
- Share of users who come back after a gap of three or more days.
- Share of finished goals that lead straight into a new goal.
- Fish, as user one, logs on most days for eight weeks.

---

## 10. Open questions for the brand step

- The coach was named Juno in the Pocket Spotter mockups. Now that Juno is the app, does the
  coach share the name, or does each user name their own?
- Is Juno's core promise about **consistency** ("keep showing up") or **progress** ("watch
  the numbers go up")? The research favors consistency as the engine and progress as the reward.

---

## Sources

- App retention: [Stream app retention guide](https://getstream.io/blog/app-retention-guide),
  [Braze mobile app retention](https://www.braze.com/resources/articles/mobile-app-retention),
  [Business of Apps health and fitness benchmarks](https://www.businessofapps.com/?p=98298).
  Vendor compilations, so treat the numbers as directional.
- Gym dropout (Sperandei et al., 2016, *Journal of Science and Medicine in Sport*), via
  [Smart Health Clubs](https://smarthealthclubs.com/blog/100-gym-membership-retention-statistics/)
  and [FitCraft adherence statistics](https://getfitcraft.com/science/workout-adherence-statistics).
- Habit formation (Lally et al., 2010, *European Journal of Social Psychology*), via
  [BPS Research Digest](https://bps.org.uk/research-digest/how-form-habit) and
  [PsyBlog](https://www.spring.org.uk/2023/01/form-a-habit.php).
- Tracker abandonment: [University of Washington study via Star Tribune](https://www.startribune.com/why-people-quit-their-fitbits/393122361),
  [Lived informatics study, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC5428074),
  [Centercode wearables survey](https://www.centercode.com/blog/are-users-leaving-their-fitness-wearables-behind),
  [Live Science](https://www.livescience.com/health/exercise/4-reasons-why-you-keep-abandoning-your-fitness-trackers-and-smartwatches).
- The what-the-hell effect (Polivy and Herman): [EFPSA research summary](https://more.efpsa.org/rpblog/?p=1172),
  [WeightWatchers explainer](https://www.weightwatchers.com/us/blog/what-the-hell-effect).
- Food logging adherence: [Photo vs calorie app trial, JMIR 2014](https://www.jmir.org/2014/4/e109/),
  [Self-monitoring review, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC4004142).
- Internal: `docs/PRD.md`, `docs/REFERENCE.md` §0 and changelog, `docs/handoffs/POCKET-SPOTTER-001.md`.
