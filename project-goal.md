# Bad Habit Frequency Reducer — Project Goal

## How OpenCode should use this file

This file is the authoritative project objective.

The user may invoke the goal with:

```text
/goal read the project-goal.md file and achieve the file's goal
```

Treat the entire file as the persistent implementation objective. Work autonomously through implementation, testing, integration, cleanup, and verification. Do not stop merely because scaffolding or an individual feature is complete. Continue until the completion criteria are satisfied, or a genuine external blocker prevents the remaining work.

---

# Existing Project Connections

GitHub repository:

`https://github.com/berliandro/bad-habit-tracker.git`

GitHub repository name:

`berliandro/bad-habit-tracker`

Default branch:

`main`

Google Apps Script Script ID:

`1OL09EX3reHw84J2hKJlt8cXbuTPKfHKR0TBIebAYKrC4PLEWFngoTgV9`

The GitHub repository already exists.

The Google Spreadsheet already exists.

Do not create a replacement GitHub repository.

Do not create a second spreadsheet as part of normal initialization.

Inspect the existing Apps Script project and spreadsheet relationship before implementing initialization.

---

# 1. Primary Product Objective

Create a polished personal web application called **Bad Habit Frequency Reducer**.

The application helps the user either:

- gradually reduce the frequency of a behavior, or
- optionally work toward stopping it completely.

The application is **habit-blind**: it must never need to know what the behavior actually is.

The main progress metric is the **time between occurrences**.

Example progression:

`2 days → 3 days → 3 days → 5 days → 6 days → 8 days`

This is illustrative only. Do not hard-code this sequence.

An occurrence is treated as behavioral data, not as a moral failure.

---

# 2. Most Important Requirement: Habit-Blind Architecture

The entire application must be completely unaware of what the bad habit actually is.

The application is not a habit-identification system.

It may know only:

- that an occurrence happened
- when it happened
- how many occurrences happened
- the interval between occurrences
- the user's reduction goal
- the user's desired frequency
- numerical/statistical history

It must NOT know, store, infer, request, classify, or transmit:

- the name of the habit
- the type of habit
- the category of habit
- a description of the habit
- reasons for the habit
- triggers
- semantic details identifying the habit
- other unnecessary personal details

Do not create database fields such as:

- `HabitName`
- `HabitType`
- `HabitCategory`
- `HabitDescription`

Do not create a screen asking the user to choose or name the habit.

Do not ask the user what the habit is.

Do not attempt to infer what the habit is.

The system should refer to it generically as:

- "the habit"
- "the behavior"
- "an occurrence"
- "your target"

---

# 3. Privacy Model

Gemini should not need to know what the habit is.

Only send minimal anonymized behavioral information to Gemini, such as:

- occurrence dates
- occurrence counts
- intervals
- recent average
- recent median
- recent frequency
- user's goal mode
- user's target frequency

Example:

```json
{
  "recentIntervals": [2, 3, 3, 5],
  "recentOccurrences": 5,
  "averageInterval": 3.25,
  "medianInterval": 3,
  "latestInterval": 5,
  "goalMode": "REDUCE_FREQUENCY",
  "targetOccurrences": 2,
  "targetPeriodDays": 7
}
```

Do not include habit identity in any AI request.

The AI system prompt should never request the habit name.

---

# 4. User Input Privacy

The preferred logging interaction is generic.

Examples:

> I did it today.

> I did it again.

> I did it twice today.

The application should not require the user to describe the behavior.

If the user accidentally includes identifying information in their input, avoid persisting or sending that identifying text wherever technically practical.

Prefer storing normalized data such as:

- `occurred = true`
- `occurrenceCount = 1`
- `eventDate = YYYY-MM-DD`

instead of permanently storing the raw natural-language input.

The spreadsheet should therefore contain only the minimum information needed for frequency tracking.

---

# 5. Goal Modes

The user chooses one of two objectives.

## Reduce Frequency

The user defines how frequently the behavior should ideally occur.

Examples:

- `1 time / 7 days`
- `2 times / 7 days`
- `3 times / 7 days`
- `1 time / 14 days`
- custom frequency

The exact UI may be improved, but the user must be able to define:

**How frequent should the habit be allowed to occur?**

The target represents a long-term desired frequency, not necessarily an immediate requirement.

## Stop Completely

The user can optionally select:

**Stop**

In this mode there is no frequency target.

Instead, the application progressively increases the recommended abstinence interval based on recent history.

The user must be able to switch between these modes later in Settings.

---

# 6. Critical Target Logic

When the user has configured a frequency target, the Gemini analysis must determine the **next minimum number of complete days without an occurrence** the user should aim for.

The recommendation must consider both:

1. the user's selected frequency target
2. the user's recent actual history

It must not simply invent an arbitrary number.

For example, if the user chooses:

`2 occurrences per 7 days`

the application should understand that the target represents a long-term frequency constraint and use it together with recent behavior to determine a realistic next abstinence interval.

The AI should consider:

- recent intervals
- recent average
- recent median
- latest interval
- recent frequency
- trend
- consistency
- setbacks
- user's selected frequency target

The recommendation should help move the user toward the selected target.

The backend should also validate that the AI recommendation does not obviously contradict the configured goal.

---

# 7. Stop Mode Logic

When the goal is `STOP`:

- there is no frequency target
- Gemini should recommend a realistic next abstinence interval
- the recommendation should generally progress gradually
- increasing interval length is the primary measure of progress

Do not force an immediate extreme target unless supported by the user's history.

---

# 8. Frequency Goal UI

During first-run setup, provide a goal configuration screen.

Allow the user to select:

- `Reduce frequency`
- `Stop completely`

When Reduce Frequency is selected, allow configuration of the target frequency.

Examples:

- 1 occurrence / 7 days
- 2 occurrences / 7 days
- 3 occurrences / 7 days
- 1 occurrence / 14 days
- custom

Store only numerical goal information.

Never store the identity of the habit.

Make it clear that this is a personal behavioral target, not a medical recommendation.

---

# 9. Settings

Create a Settings menu inside the webapp.

Include at minimum:

## Goal

Allow the user to:

- switch between Reduce Frequency and Stop
- edit the frequency target

## Edit API Key

Allow the user to replace the Gemini API key.

## Application Information

Provide a short privacy explanation, such as:

> This app intentionally does not need to know what habit you are tracking. It stores occurrence timing and frequency statistics.

---

# 10. Gemini API Key Management

The user will enter the Gemini API key through the webapp.

Use Apps Script `PropertiesService` for secure server-side storage.

The API key must never be:

- returned to the browser
- stored in localStorage
- embedded in HTML
- embedded in client JavaScript
- included in URLs
- committed to GitHub

When the webapp loads:

1. check whether a Gemini API key exists
2. if configured, continue normally
3. if missing, show a polished in-app setup modal

Do not use the browser's native `prompt()`.

---

# 11. Missing API-Key Modal

If no Gemini key is configured, automatically show a setup modal using the same visual theme as the main application.

The modal should include:

- title
- short explanation
- API-key input
- Save API Key button
- loading state
- success state
- error state

Send the key to a server-side Apps Script function.

Store it in Script Properties.

Never provide a backend endpoint that returns the stored key.

The UI may expose only a status such as:

- `Gemini API key configured`
- `Gemini API key not configured`

---

# 12. AI Step A: Normalize the Occurrence

The first AI operation may interpret the user's generic natural-language log.

It should determine only non-identifying information:

```json
{
  "occurred": true,
  "occurrenceCount": 1,
  "eventDate": "YYYY-MM-DD",
  "confidence": 0.95
}
```

Do not ask Gemini to identify the habit.

Do not ask Gemini for context about the habit.

Do not store habit identity.

Do not invent facts.

If the input is ambiguous, behave conservatively.

If deterministic parsing is reliable for a simple input, prefer deterministic handling over unnecessary AI usage.

---

# 13. Save the Event

After normalization:

1. calculate deterministic interval information
2. append the normalized event to Google Sheets
3. confirm the write succeeded
4. continue to the recommendation step

If AI analysis fails afterward, preserve the saved event.

A Gemini outage must not erase or corrupt an already logged occurrence.

---

# 14. AI Step B: Determine the Next Minimum Abstinence Target

After saving the latest occurrence, call Gemini again.

The second AI operation should answer:

**How many complete days should the user aim to go without another occurrence before the next acceptable occurrence?**

For Reduce Frequency mode, the analysis must use:

- target frequency
- recent frequency
- recent intervals
- average and/or median interval
- latest interval
- trend
- consistency

For Stop mode, use:

- recent intervals
- recent progression
- consistency
- realistic progression

Return structured JSON similar to:

```json
{
  "recommendedDays": 5,
  "reason": "string",
  "confidence": 0.88
}
```

Interpret `recommendedDays` as the minimum target interval before the next acceptable occurrence.

The backend calculates the calendar date.

---

# 15. Deterministic Date Calculation

Do not rely on Gemini for calendar arithmetic.

Gemini returns the interval.

The backend calculates:

`nextTargetDate = eventDate + recommendedDays`

Use an explicit/configured timezone, preferably the Apps Script project timezone.

Validate:

- positive integer
- sensible maximum
- valid date
- no negative values
- no malformed value

---

# 16. Deterministic Guardrails

Do not allow AI output to create nonsensical targets.

Implement reasonable backend validation.

At minimum:

- reject negative values
- reject zero where inappropriate
- reject non-integers
- reject invalid dates
- constrain extreme recommendations
- prevent obvious contradictions with the user's configured goal
- preserve the original historical data

Where useful, store both:

- AI recommended days
- final validated target days

This provides an audit trail.

---

# 17. Google Sheet Integration

The spreadsheet already exists.

Do not create a second spreadsheet during normal initialization.

Create an idempotent setup function such as:

`initializeApp()`

It should:

- identify the existing spreadsheet
- locate or create the required worksheet
- validate headers
- add missing headers safely
- avoid duplicate headers
- establish defaults where needed
- be safe to run repeatedly

If the Apps Script project is spreadsheet-bound, use the bound spreadsheet.

If it is standalone, use an explicitly configured Spreadsheet ID stored server-side rather than creating a new spreadsheet.

---

# 18. Spreadsheet Schema

Use a privacy-preserving schema such as:

- Log ID
- Timestamp
- Event Date
- Occurred
- Occurrence Count
- Days Since Previous Occurrence
- Goal Mode
- Target Frequency Count
- Target Frequency Period Days
- Previous Target Days
- AI Recommended Days
- Final Target Days
- Next Target Date
- AI Reason
- AI Confidence
- Gemini Model Used
- Processing Status
- Created At

Improve the schema where technically justified.

Do not add habit identity fields.

Centralize the column definitions in code.

---

# 19. Recent History Analysis

Do not send the full spreadsheet to Gemini unnecessarily.

Prefer approximately the most recent 10–30 meaningful occurrence records.

Calculate deterministic metrics before AI analysis where useful:

- recent occurrence count
- intervals
- average interval
- median interval
- shortest interval
- longest interval
- latest interval
- current streak
- longest interval
- recent frequency
- recent trend

Send only the minimum relevant numerical/history information to Gemini.

---

# 20. Gemini Model Fallback System

The intended strategy is:

1. lightweight Flash-Lite model
2. full Flash model
3. additional Flash fallback
4. additional Flash fallback
5. additional Flash fallback
6. additional Flash fallback
7. final fallback

Before implementation, verify the **currently valid Gemini API model identifiers and availability**.

Do not blindly assume model names from earlier specifications are still valid.

Map the requested priority to currently available models.

The important ordering principle is:

**Flash Lite first → Flash fallbacks afterward.**

Centralize the model configuration.

For example:

```javascript
const GEMINI_MODEL_FALLBACKS = [
  "...",
  "...",
  "..."
];
```

Never duplicate model IDs throughout the codebase.

Record the model that successfully handled each AI request.

---

# 21. Gemini Fallback Error Handling

Distinguish useful error classes where practical:

- rate limit
- quota exhausted
- invalid API key
- unavailable model
- malformed request
- malformed AI response
- server error
- timeout

Move to the next model when appropriate.

Do not endlessly retry the same model.

If every model fails:

- preserve the saved occurrence
- return a controlled error
- do not corrupt the spreadsheet
- inform the user that logging succeeded but AI analysis is temporarily unavailable

---

# 22. Habit-Blind AI Prompts

Centralize all Gemini prompts.

The system prompt must make the privacy model explicit.

Gemini should be told:

- the tracked behavior's identity is intentionally unavailable
- only occurrence statistics are being analyzed
- do not infer or request the behavior's identity
- do not invent context
- distinguish observed facts from recommendations
- use the user's configured target when available
- recommend realistic progression
- do not diagnose
- do not use shame-based language
- return strict JSON

The application should never intentionally tell Gemini what the habit is.

---

# 23. Backend Architecture

Use a modular Apps Script backend.

Possible functions include:

- `doGet()`
- `getDashboardData()`
- `logOccurrence()`
- `initializeApp()`
- `isGeminiConfigured()`
- `saveGeminiApiKey()`
- `getGoalSettings()`
- `saveGoalSettings()`
- `getRecentHistory()`
- `analyzeRecentHistory()`
- Gemini request/fallback helpers
- spreadsheet helpers
- validation helpers
- date helpers

Use separate files where that improves maintainability.

Keep responsibilities separated:

- presentation
- configuration
- spreadsheet persistence
- business logic
- AI integration
- validation

Avoid one giant Apps Script file.

---

# 24. Client/Server Security

The browser must never:

- directly access Google Sheets
- receive the Gemini API key
- store the Gemini API key
- send the Gemini API key to a third-party API directly

The Apps Script backend controls:

- spreadsheet access
- Gemini access
- API-key storage
- target calculations
- validation

---

# 25. Frontend Dashboard

Create a polished dashboard rather than a simple form.

Include:

## Current Interval

Example:

`4 days`

## Next Target

Example:

`5 days`

## Days Remaining

Example:

`3 days`

## Goal

Example:

`Target: 2 times / 7 days`

or:

`Goal: Stop`

## Recent History

A timeline/list of recent occurrences and intervals.

## Progress Statistics

Useful metrics:

- latest interval
- average interval
- median interval
- longest interval
- current streak
- recent frequency
- trend

## AI Insight

A concise explanation of why the next target was selected.

Keep the dashboard focused.

---

# 26. Main Logging Experience

Make the primary action immediately visible.

Use an input such as:

> Tell me what happened...

Example helper text:

> For example: I did it today.

Button:

`Log occurrence`

After submission:

1. show a real loading state
2. process the occurrence
3. save it
4. analyze updated history
5. calculate the target
6. update the dashboard
7. show the new target

Possible loading labels:

- `Recording...`
- `Updating your timeline...`
- `Calculating your next target...`

Do not fake progress percentages.

---

# 27. Visual Design

Create a premium modern application.

Design direction:

**black + aurora + liquid glass + minimal + futuristic + calm**

Use:

- near-black background
- subtle aurora lighting
- frosted glass surfaces
- translucent cards
- backdrop blur
- soft borders
- subtle reflections
- large rounded corners
- elegant typography
- refined spacing
- restrained motion

Use Pinterest as visual inspiration for:

- composition
- visual hierarchy
- card presentation
- editorial feel
- visual discovery

Use Apple's Liquid Glass aesthetic only as inspiration for:

- translucency
- depth
- blur
- highlights
- layered materials

Do not directly copy Apple's interface.

The result should feel like a custom personal product, not a generic admin dashboard.

---

# 28. Aurora Background

Create a subtle animated aurora behind the application.

Requirements:

- dark base
- blurred ambient lighting
- low contrast
- slow movement
- readable content
- low CPU impact
- `prefers-reduced-motion` support

---

# 29. Responsive Design

Support:

- phones
- tablets
- desktop

Prioritize mobile.

The primary logging interaction should be fast and comfortable on a phone.

Use accessible touch targets.

Avoid unnecessary scrolling.

---

# 30. Accessibility

Implement:

- semantic HTML
- keyboard navigation
- visible focus states
- accessible labels
- reasonable contrast
- reduced-motion support
- appropriate ARIA attributes

---

# 31. Error Handling

Use structured backend responses.

Success:

```json
{
  "success": true,
  "data": {}
}
```

Failure:

```json
{
  "success": false,
  "error": {
    "code": "AI_UNAVAILABLE",
    "message": "..."
  }
}
```

Never show raw server stack traces to ordinary users.

Keep useful debugging information in server-side logs.

If the event was saved but analysis failed, clearly state that the event was saved and AI analysis is temporarily unavailable.

---

# 32. Corrections

Where practical, add lightweight support for:

- undo recent entry
- edit accidental entry
- delete accidental entry

Do not make the primary logging workflow complicated.

---

# 33. Privacy-Preserving Database

A spreadsheet row should conceptually resemble:

```text
2026-10-06 | occurrence=1 | interval=4 | target=5 | nextTarget=2026-10-11
```

It should not resemble:

```text
2026-10-06 | habit=XYZ | reason=...
```

Store only what is needed to measure frequency and progress.

---

# 34. GitHub Integration

Use exactly:

`https://github.com/berliandro/bad-habit-tracker.git`

Do not create another repository.

Before committing:

- inspect repository state
- create/update `.gitignore`
- verify no secrets are present
- verify no Gemini API key is present
- verify no credentials are present
- commit the implementation
- push to `main` when appropriate
- verify the resulting repository state

Do not claim a successful push without evidence.

---

# 35. clasp / Apps Script Integration

Use the supplied Script ID:

`1OL09EX3reHw84J2hKJlt8cXbuTPKfHKR0TBIebAYKrC4PLEWFngoTgV9`

Configure `.clasp.json`.

Inspect the existing Apps Script project before overwriting important existing content.

Synchronize the local project with the supplied Script ID.

Verify the result.

Do not claim synchronization succeeded without evidence.

---

# 36. Testing

Actually test the implementation.

Verify as much as the available environment allows:

- project structure
- Apps Script syntax
- HTML/CSS/JavaScript
- existing spreadsheet detection
- worksheet initialization
- repeated initialization
- schema validation
- API-key detection
- first-run API-key modal
- API-key replacement
- goal configuration
- Reduce Frequency mode
- Stop mode
- occurrence logging
- recent history retrieval
- interval calculations
- frequency-target logic
- target-date calculation
- Gemini structured-response parsing
- Gemini fallback logic
- malformed AI response handling
- API failure handling
- dashboard generation
- client/server communication
- Git status
- GitHub synchronization
- clasp synchronization

Do not fabricate tests.

---

# 37. README

Create a complete README covering:

- project overview
- habit-blind privacy architecture
- data model
- setup
- Apps Script
- existing Google Sheet
- Gemini API key setup
- missing-key modal
- Settings → Edit API Key
- goal modes
- frequency targets
- Gemini model fallback
- AI data flow
- privacy
- clasp
- GitHub
- deployment
- testing
- troubleshooting

Clearly explain that the system intentionally does not know what habit is being tracked.

---

# 38. Product Boundaries / Non-Goals

Do not turn this into:

- a social network
- multi-user SaaS
- a medical diagnosis platform
- therapist replacement
- general AI chatbot
- habit-identification system
- habit-classification system
- unnecessary analytics platform

This is a private, habit-blind frequency-reduction tool.

Prioritize reliability, privacy, and usability over feature count.

---

# 39. Behavioral Design

The application should emphasize increasing intervals.

Prefer language such as:

> Your latest interval was longer than your previous one.

> Your recent intervals are gradually increasing.

> A slightly longer target is reasonable based on your recent history.

Avoid:

> You failed.

> You are weak.

> You have no discipline.

An occurrence is behavioral data, not moral judgment.

---

# 40. Completion Criteria

Do not mark the goal complete merely because source files exist.

The goal is complete only when actual verification shows that:

1. the webapp is implemented
2. the existing spreadsheet is correctly used
3. initialization is idempotent
4. the database contains no habit-identity field
5. Gemini receives no habit identity
6. generic occurrence logging works
7. Reduce Frequency mode works
8. Stop mode works
9. user-defined frequency targets can be configured
10. Gemini uses recent behavioral history
11. Gemini uses the configured frequency target when in Reduce Frequency mode
12. Gemini determines the next minimum abstinence interval
13. the backend calculates the actual target date
14. AI output is validated
15. fallback models are implemented
16. missing API keys trigger the themed setup modal
17. API keys can be edited through Settings
18. API keys remain server-side
19. dashboard works
20. UI is polished and responsive
21. privacy requirements are enforced architecturally
22. tests have been performed
23. GitHub synchronization is verified
24. clasp synchronization is verified where authentication permits
25. README is complete
26. no implementation-critical placeholder functionality remains

Use actual inspection, command output, test output, and synchronization evidence before declaring completion.

---

# 41. External Blockers

The GitHub repository and Apps Script Script ID are already supplied.

Do not ask for them again.

The Gemini API key is intentionally not provided during development.

That is expected.

The completed webapp must collect the Gemini API key through the themed UI and store it securely in Script Properties.

Do not stop implementation because the Gemini key is not configured.

Only treat missing authentication or unavailable external access as a blocker for the specific action that genuinely requires it.

Complete everything else.

---

# 42. Final Completion Report

When the goal is genuinely complete, provide a concise report containing:

- files created/changed
- architecture
- habit-blind privacy implementation
- goal modes
- frequency-target logic
- actual Gemini model fallback order
- API-key setup behavior
- Settings behavior
- spreadsheet schema
- tests performed
- GitHub commit/push status
- clasp synchronization status
- deployment status
- exact remaining user-only action, if any

Do not claim success without evidence.
