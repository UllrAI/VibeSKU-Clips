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

- **Standard page.** `DashboardPageWrapper` with a title, one orienting
  sentence, and actions beside the title on wide screens. The wrapper renders
  the title as the page `h1`.
- **Library and gallery.** Search and filters form one control group. Cards keep
  consistent geometry; media, title, metadata, and state sit in the same
  positions across peers.
- **Creation workspace.** The plan being built is the focal object. Controls
  cluster by task, and the running total stays visible before submission.
- **Review workbench.** Clips are compared, so their frames must be identical in
  size and their metadata in the same order. Decisions are one click, and the
  current decision is legible without colour alone.
- **Data-heavy table.** Numeric columns use tabular numerals and align right;
  horizontal scrolling is contained to the table.

### Work that takes minutes

Generation runs for minutes, so the screen has to stay usable while it does.

- Progress is a compact bar that sticks to the top of the work surface, not a
  panel that pushes the surface down. It is collapsed by default and answers one
  question — how much is left; the per-state breakdown is one click away.
- The coloured bar is decorative. The semantics live in a `<progress>` element
  and a polite live region, so a screen reader hears the change once, in words.
- Progress updates itself. The operator never presses reload to find out what
  happened, and the page says so: the work continues if they close the tab.
- Never invent a countdown. Show what is measured — how many clips are left —
  rather than an estimate the system cannot stand behind.
- A batch that is still expanding shows the planned count as the denominator.
  The unfilled part of the bar is work not yet started, not work that failed.

### Selection and bulk actions

- The action for a selection lives in a bar that appears with the selection and
  sticks to the bottom of the viewport, next to the work. It states the count,
  offers select-all and clear, and carries the primary action.
- Selection and decision are different gestures with different affordances.
  Both are real buttons carrying `aria-pressed`, never colour alone.
- Only a finished clip can be played, decided on, or exported. A still frame
  behind player chrome invites a click that goes nowhere, so unfinished clips
  show the reason instead of a player.

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
clip is produced in, and a batch's output language never changes the interface.

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
