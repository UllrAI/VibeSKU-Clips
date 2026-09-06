---
title: The VibeSKU Clips Production Guide
publishedDate: 2026-09-05
excerpt: A complete walkthrough of a production run, from pasting a product link to handing a folder of approved vertical clips to whoever posts them. Read it once before your first batch of eighty.
tags:
  - Guide
  - Production
  - Operations
  - TikTok Shop
author: admin
---

This is the long version. It follows one production run end to end and explains
what each step is actually doing, so that when something looks wrong at clip
fifty-three you know which stage to go and look at.

The short version is four sentences. You register a product and let the system
read its material. You write or generate scripts for it. You build a batch that
says, in explicit lines, how many clips you want and in what language. Then you
review what came back and export the ones you will post.

## What this tool is for

It produces short vertical video for shoppable feeds. Every clip is 15 seconds,
9:16, 1080×1920, with burned-in captions and a separate subtitle file. That
specification is not configurable, and that is deliberate: it is the shape the
placements want, and fixing it means every downstream check — duration, caption
safe area, file naming — can be strict instead of advisory.

It is built for account matrices. The assumption is that you are not making one
video, you are making forty for eleven accounts across three markets, and that
the hard part is not generation but keeping track of which asset belongs where
and which ones a person has actually approved.

It is not an editor. There is no timeline, no keyframes, no colour grading. If
a clip is nearly right but needs a trim, the answer here is to regenerate it,
not to nudge it.

## 1. The product comes first

Everything downstream inherits from the product record, so mistakes here are
expensive. A product needs a name, and then as much of the following as you have:
a source link, product images, a market, a variant, and a short brief.

When you save a product with a source link, a background job fetches the page
and reads it. What it extracts becomes the product's **facts**: the claims that
are safe to say on camera. Materials, sizes, what is in the box, the one or two
things that genuinely differentiate it. Facts are not marketing. "Machine
washable" is a fact; "the last laundry bag you will ever buy" is not.

Your **brief** is separate and sits above the facts in precedence. It is where
you put the things the page does not know: the angle you want, the objection you
want handled, a phrase legal has asked you to avoid. When the brief and the
facts disagree, the brief wins, because you are the one who has to answer for
the claim.

If the link cannot be read — it is dead, it is behind a login, it returns
something that is not a page — the product is marked as needing input and left
alone. It does not silently proceed with an empty fact sheet, and it does not
take the rest of your queue down with it. You add images or write the facts
yourself, and it rejoins the pipeline.

Two fields are worth calling out because operators skip them and regret it. The
**storefront link** is the shoppable URL for the market you are targeting; it is
what makes an asset actually usable when it reaches whoever posts it. The
**market** is not the language. More on that in a moment.

## 2. Talents are reusable, and they are on the record

A talent is the person on camera. You can upload a reference image or describe
one and have it generated, and either way the talent is saved and reused, so the
same face can carry ten products across two months.

Each talent carries a licence note. If you uploaded a real person's likeness,
that field is where the release lives. If the likeness was generated, say so
there. This is not bureaucracy — the export manifest reads that field, and a
handover that cannot say where a face came from is a handover that will
eventually cost you a takedown.

A batch line can name zero, one, or several talents. Zero means product-led
footage with no presenter. Several means the same script performed by each of
them, which is the cheapest useful A/B test this tool offers: identical words,
different delivery, and you find out whether your hook or your casting was the
problem.

## 3. Scripts: three shapes, and two settings people confuse

Three templates cover the formats that actually convert in this placement.

**Spokesperson** is a person talking to camera. Hook, claim, proof, call to
action. It carries specific factual claims better than anything else, and it
lives or dies on the first two seconds.

**Scenario** dramatises the problem before the product appears. The problem has
to be recognisable within about three seconds or the viewer is gone, so it works
best for products that solve a visible, physical annoyance.

**Tutorial** shows the thing being used, step by step. It is the most forgiving
of a weak hook because the demonstration itself is the hook, and it is the right
choice for anything where "how does that even work" is the main objection.

A generated script comes back as a hook, a small set of timed beats, a voiceover
line, caption lines, a publish caption, and a disclosure line appropriate to the
locale. The voiceover is length-checked against the 15-second budget before it
ever reaches a renderer — roughly 210 characters for Latin scripts, 90 for CJK.
A script that cannot be read in time is not a script, it is a reshoot.

Now the part that causes the most confusion in practice: **language and market
are two different settings.** Language is what the clip is spoken and captioned
in. Market is where the clip will run — which storefront link applies, which
disclosure wording is required, which cultural references land. Portuguese for
Brazil and Portuguese for Portugal are the same language setting and different
market settings, and treating them as one field is how you end up with a
technically correct video that reads as foreign.

Scripts are versioned. Editing one does not overwrite it; it creates a revision
that keeps a pointer to what it came from. Clips remember which version they
were rendered against, so "why does this clip say something the script doesn't"
always has an answer.

## 4. Batches are arithmetic you can do in your head

A batch is a list of explicit lines. Each line names a product, a language, a
market, a template, how many scripts to write, how many clips per script, and
which talents to use. The clips that line produces are:

```
scripts × clips per script × max(1, talents on this line)
```

Nothing takes the cross-product of your settings. Adding a language does not
re-run every other line in that language; it adds one line, and the total goes
up by exactly what that line produces. Before you submit, the summary shows the
clip count, the number of new scripts, the products involved, and the estimated
credits — computed by the same function the server uses to expand the plan, so
the number you approved is the number that runs.

There is a switch worth using on anything above about thirty clips: **review
scripts first**. It writes all the scripts, then stops and waits. You read them,
fix the two that are wrong, and release the batch for rendering. Reading thirty
scripts takes ten minutes. Watching thirty wrong clips render takes longer and
costs more.

Rendering runs across several lanes per batch, so a slow clip does not hold up
the rest, and a batch that is half done is genuinely half done — the finished
clips are already in review while the others are still working.

## 5. What the renderer actually does

Each clip is produced in two stages, and knowing this explains most of what you
will see in the console.

First, an opening frame is generated: the talent, the product, the setting, the
framing. This is a still image, and it is fast and cheap relative to video.
Second, that frame is handed to the video model as the reference the motion
starts from. This is why a talent looks like the same person across ten clips
and why the product does not quietly become a different product halfway through
a batch. It is also why a bad opening frame is worth catching early — everything
after it inherits the mistake.

Then the subtitle track is built from the script's timed beats, and the finished
video, cover, and subtitle file are copied into your own storage. Generation
providers expire their URLs; an export that stops resolving three weeks later is
not a deliverable, so nothing is left pointing at a temporary link.

## 6. The quality gate

Before a clip reaches you, six checks run against it.

**Duration** compares the actual runtime with the 15-second target, within a
tolerance of about seven tenths of a second. **Voiceover length** confirms the
words fit the time at a natural pace. **Caption safe area** confirms the burned
captions sit clear of the regions where the platform puts its own interface —
captions hidden behind a shop button are captions nobody read. **Product
accuracy** checks the spoken claims against the product's facts. **Talent
consistency** compares the delivered frames with the talent reference.
**Locale expression** flags copy that is grammatically correct but reads as
translated.

A clip that fails a check is marked failed with the specific finding attached.
You are never shown a bare "something went wrong" when the system knows which
check fired.

## 7. Review is where the decisions happen

The review workbench exists because comparing near-identical takes is genuinely
hard and most tools make it harder. Clips are shown at identical frame size with
their metadata in the same order every time, so your eye can actually do the
comparison. Decisions are one click and one keystroke.

The workbench surfaces **similarity hints**. When two clips in a batch are
textually close enough that they would read as the same video to anyone
scrolling — the same hook, the same beats, a synonym swap — it tells you. Eleven
accounts posting eleven near-identical clips on the same day is exactly the
outcome an account matrix is supposed to avoid.

Two actions look similar and are not:

**Retry** re-attempts a clip that failed. Your target count does not move; you
asked for twenty and you still want twenty.

**Regenerate** is you asking for another version of a clip that succeeded. It
produces a new clip that keeps a link back to its source, and the original stays
where it was so you can compare them. This adds to what was produced, because
you asked for it.

Both consume credits, and every unit of work — analysis, script, render, retry,
regeneration — is recorded separately with its own cost. That is what makes cost
per _delivered_ clip a number you can compute rather than estimate.

## 8. Export, and the flag that saves the most time

Exports group approved clips the way the next person needs them: by product, by
account, by market, or by language. Each export produces a manifest listing
every asset with its reference number, product, language, market, template,
talent, licence note, publish caption, disclosure line, and storefront link.

If a clip has no storefront link for its market, it ships flagged as **awaiting
product match**. It is not quietly assumed to be shoppable. Three states get
conflated constantly — generated, selected, and matched — and keeping them apart
is most of what makes a handover trustworthy. Generated means the clip exists
and passed the gate. Selected means a person watched it and chose it. Matched
means the storefront link is on file. A clip can be all three or only one, and
the manifest says which.

## 9. When things go wrong

They will, and the design principle is that failure stays local.

A product whose material cannot be read is paused on its own; its lines are
skipped and the rest of the batch runs. A clip that fails is marked failed with
its reason and can be retried by itself. Automatic retries have a hard limit, so
a broken input cannot burn a budget in a loop overnight. Cancelling a batch
stops what is queued and in flight without touching what is already delivered —
clips that passed the gate stay in review exactly where you left them.

The one failure mode the tool cannot protect you from is a wrong product record.
Facts, brief, market, storefront link: get those right and everything downstream
is a matter of taste. Get them wrong and you will have eighty well-produced
videos saying the wrong thing.

## A reasonable first run

Register three products with links and images. Wait for the analysis. Read the
facts it extracted and correct anything wrong. Create one talent. Build a batch
of one line per product — one script, two clips per script, one talent, your
home language and market — with review-scripts-first turned on. That is six
clips. Read the three scripts, release the batch, and review what comes back.

You will know within twenty minutes whether your product records are good, and
that is the only thing worth learning before you commit to eighty.
