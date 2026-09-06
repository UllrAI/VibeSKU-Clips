---
name: vibesku-clips-design-guidelines
description: "Design and implementation rules for VibeSKU Clips surfaces. Use for every user-facing page, component, email, and generated product UI."
---

# Design VibeSKU Clips surfaces with restraint

This document is the design source of truth for the repository. VibeSKU Clips is
a production tool: operators sit in it for hours, comparing near-identical video
takes and deciding which ones ship. The interface has to stay calm while the
work underneath is complex, and it has to keep the media as the most colourful
thing on the screen.

It takes its editorial restraint, hierarchy-first composition, and evidence-led
approach from [Vercel's design guidance](https://vercel.com/design.md), while
keeping its own warm identity.

## Protect these priorities

When requirements compete, protect them in this order:

1. Preserve product facts, licences, counts, versions, and localisation.
2. Make the operator's current task, the system's state, and the next action
   immediately clear.
3. Preserve the repository's semantic containers, tokens, and UI primitives.
4. Maintain the product's authorship through the warm palette, 8px geometry,
   and disciplined borders.
5. Refine responsive behaviour, accessibility, and details without weakening
   the hierarchy.

## Product principles

1. **Start with the operator's job.** The primary task and its next action are
   clear in the first viewport.
2. **Hierarchy before decoration.** Type, alignment, density, and spacing do
   most of the work. Surfaces and colour support them.
3. **One visual grammar.** Every page shares the same shell, content widths,
   heading roles, spacing scale, radii, and interaction states.
4. **Make complexity inspectable.** Summaries lead; exact settings, quality
   findings, costs, and version history stay available nearby.
5. **Earn every boundary.** Use a border, panel, or shadow only when it explains
   grouping, selection, elevation, or state.
6. **Both themes, all viewports.** Light, dark, keyboard, touch, zoom, and
   reduced-motion are first-class.

## Foundations

### Colour

Use the semantic tokens in `styles/theme.css`. Never hard-code a page palette.

- `background` is the continuous warm page canvas.
- `foreground` and `muted-foreground` are the primary and supporting reading
  levels.
- `card`, `popover`, and `muted` are functional surfaces, not decoration.
- `primary` is VibeSKU amber. Reserve it for the primary action, the current
  selection, focus, and small pieces of meaningful emphasis.
- `destructive` is only for destructive actions, failed clips, and errors.
- Chart colours encode distinct data series; they are not page decoration.

Do not add decorative gradients, glows, glass effects, coloured shadows, or
large tinted backgrounds. Generated media may be as colourful as it likes,
because it is content.

### Typography

- Page title: `text-2xl sm:text-3xl`, semibold, tight tracking.
- Section title: `text-xl`, semibold.
- Card or subsection title: `text-base`, medium or semibold.
- Body: `text-sm` or `text-base`, relaxed leading for long passages.
- Metadata: `text-xs` or `text-sm` with `muted-foreground`.

Every route has one visible, descriptive `h1`. Outside the dashboard the page
title carries it; inside, the current page in `DashboardPageHeader` is the `h1`,
so pages must not add a second one. Use sentence case. Do not
use all-caps eyebrows, decorative tracking, or tiny grey text to force content
into a layout. Reference numbers, model ids, and timestamps use the mono stack
and `tabular-nums`.

### Layout and spacing

Outside the dashboard use the semantic containers in
`src/components/layout/page-container.tsx`; inside it use
`DashboardPageWrapper`. Do not introduce page-local `max-w-*` systems.

- `ShellContainer` for global chrome and wide split layouts.
- `SectionContainer` for standard marketing sections and page bodies.
- `ReadingContainer` for articles and legal copy.
- `CompactContainer` for auth flows, `FocusContainer` for single-card flows.

Default section rhythm is 24–32px. Related controls and text use 4, 8, 12, 16,
or 24px gaps according to their relationship. Give every gap one owner: prefer a
parent `gap-*` or `space-y-*` rule over stacked child margins.

### Radius and shadow

The base radius is 8px.

- Controls, compact menus, and small previews: `rounded-md`.
- Cards, dialogs, sheets, and large media: `rounded-lg`.
- Avatars, status dots, and true pills: `rounded-full`.

Most surfaces use a border and no shadow. Menus, popovers, dialogs, and sheets
may use a small neutral shadow because they are elevated. Cards do not scale or
gain a large shadow on hover; use a clearer border or a subtle background
change.

### Motion

Default to stillness. Motion may explain a state change, preserve continuity,
or confirm an action. Keep transitions short and respect
`prefers-reduced-motion`. No decorative pulsing, scroll reveals, parallax,
bounce, or hover zoom.

## Page composition

- **Standard page.** `DashboardPageWrapper` with a title and one orienting
  sentence. The wrapper renders the title as the page `h1`.
- **Title bar.** The breadcrumb bar carries where you are on the left and the
  two session controls — language and appearance — on the right. It never
  carries a page action: an action belongs beside the content it acts on, so
  a list's primary action sits above the list, and an object's actions sit in
  the card that shows the object.
- **Library and gallery.** Search and filters form one control group. Cards keep
  consistent geometry; media, title, metadata, and state sit in the same
  positions across peers.
- **Composer.** Creating something is one card, not a stack of form sections:
  the subject on top, the choices under it, and the running cost pinned to the
  button that spends it. The composer asks for everything the first step needs,
  so the object it creates is never born half-answered. Nothing that is
  optional gets first-screen space, so bookkeeping fields sit behind a
  disclosure and the primary action is reachable on the first screen.
  `Cmd`/`Ctrl` + `Enter` submits from anywhere in it.
- **Never make someone leave to come back.** If a step needs an object that
  does not exist yet, the composer accepts enough to create it in place; it does
  not send the operator to another route with instructions to return. When the
  new object needs background work before the run can use it, the run waits for
  it rather than starting without it.
- **Review workbench.** Clips are compared, so their frames must be identical in
  size and their metadata in the same order. Decisions are one click, and the
  current decision is legible without colour alone.
- **Data-heavy table.** Numeric columns use tabular numerals and align right;
  horizontal scrolling is contained to the table.

### Work that takes minutes

Generation runs for minutes, so the current step must stay understandable while
it does. The step rail is the progress indicator: it names what is running, says
roughly how long that step normally takes, and updates without a manual refresh.
Never invent a countdown or a percentage when there is only one item. If the
task gives up, replace the working state with the specific failure and a retry
action; never leave the interface spinning after the task is terminal.

### A flow with steps

The production flow reports _steps_: a person who is waiting wants to know which
step is active, what it produced, and what happens if they say yes.

- The whole path is visible from the first screen. A numbered rail names every
  step, marks the ones already signed off, and carries `aria-current="step"` on
  the one the operator is in. A spinner with no rail behind it is the failure
  this replaced.
- Every step has the same shape: what it is, what it made, and one action that
  moves on. The primary action sits in the same place on every step so it never
  has to be hunted for.
- Nothing expensive runs without a confirmation, and each step shows its output
  before asking for one. Generation is preceded by the words that produced it.
- Going back is always offered, and going back never destroys the step's work
  until the operator asks for it again.
- A step that is working says what it is working on and roughly how long that
  takes. A step that gave up says so in the operator's language, keeps its place
  in the rail, and offers to run again — it never spins forever.
- Cheap changes come before expensive ones. Words are edited before the render;
  when storyboard guidance is selected, frames are reviewed between them.
- What a machine understood is shown before it is used, in the same shape the
  operator can edit. Extracted product facts are a draft with an author, not a
  verdict: reading them, correcting them, and saving them is one gesture, and
  saving is what clears the object for production.

### Work list

- A work appears in the list as soon as it is created, not only after a video
  exists. Status filters separate work in progress, work waiting for a person,
  completed work, and failures.
- Every card opens the current step. Only a finished work shows player controls
  and a direct video download; unfinished work shows the best available still.
- The list does not add review decisions, multi-selection, grouped exports, or
  delivery manifests before a real publishing workflow requires them.

## Components

- One primary action per local decision. Secondary, outline, and ghost variants
  step emphasis down.
- Inputs share height, radius, border, focus ring, label placement, helper text,
  and error treatment.
- Cards group genuinely related content. Do not nest cards or create one per
  paragraph.
- Badges communicate status, category, or compact metadata, never decoration.
- Dialogs contain one decision, with a stable cancel/confirm order.
- Empty states use the shared `EmptyState`: a dashed outline, never a solid
  card, so an absence of content does not read as content. They explain what is
  missing and offer the most relevant next action, and an empty search result
  says so rather than repeating the first-run copy.
- Route skeletons mirror the layout they replace — the same grid, the same
  media aspect ratio — so nothing jumps when the data lands. What cannot be
  mirrored honestly is left out.
- Filters over a fixed set of states are tabs with a live count, not a select.
  The counts are the fastest way to see where the remaining work is.
- Failure states name the specific finding. Never show a bare "something went
  wrong" where the system knows which check failed.

Use Lucide for interface icons at 16px, with a text label unless the action is
universally understood and has an accessible name.

## Interaction and accessibility

- Semantic landmarks and ordered headings.
- Every control has an accessible name; every form control has a visible label.
- Visible focus states and logical keyboard order.
- Touch targets at least 44×44px on coarse pointers.
- Never rely on colour alone for selection, error, or status.
- WCAG AA contrast, verified in both themes.
- At 200% zoom and narrow widths, content reflows without page-level horizontal
  scrolling.
- Loading, empty, success, and failure states get the same layout care as the
  default state.

## Localisation

All user-visible copy comes from `src/messages/en.json` and
`src/messages/zh-Hans.json` in exact key parity. Interface language and content
language are separate concerns: the locale switcher never changes the language a
clip is produced in, and the selected output language never changes the interface.

## Review checklist

Before merging a UI change, inspect the affected routes at desktop and mobile
widths in both themes, then confirm:

- the primary task and visible `h1` are clear;
- width, padding, and section rhythm use shared primitives;
- equivalent elements share type, radius, border, and state treatment;
- no decorative gradient, glow, heavy shadow, or hover zoom was introduced;
- keyboard focus, labels, contrast, reduced motion, and reflow work;
- loading, empty, error, and populated states remain usable;
- both message catalogues changed together;
- lint, type checking, tests, and the production build pass.

When a screen needs an exception, keep it local, explain the product reason in
code, and do not create a parallel token system.
