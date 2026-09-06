---
title: How a Batch Counts, and Why Retries Never Change the Number
publishedDate: 2026-09-02
excerpt: Twenty products with one script each is twenty clips. One product with three scripts and two clips per script is six. What a batch produces should be arithmetic you can do in your head before you submit it.
tags:
  - Batches
  - Cost
  - Production
author: admin
---

The fastest way to lose control of a content pipeline is to let the tool decide how much work you just asked for. You pick three languages, two talents, and two formats, press go, and discover you have commissioned twelve clips per product because something helpfully took the cross-product of your settings.

So a batch here is a list of explicit lines, and the total is the sum of those lines. Nothing multiplies unless you asked it to.

## The arithmetic

Each line names one product, one language, one market, one format, how many scripts to write, how many clips per script, and which talents — if any — to use. The clips that line produces are:

```
scripts × clips per script × max(1, talents named on this line)
```

That gives you the worked examples directly:

- Twenty products, one script each, one clip per script: **20 clips**.
- One product, three scripts, two clips per script: **6 clips**, grouped by script for comparison.
- One product, one script, three clips each for two talents: **6 clips**, all with identical copy.
- One product across three account styles, two scripts each, one clip per script: **6 clips**, reviewed and exported per group.

Adding a language to a batch does not re-run the other lines in that language. It adds a line, and the total goes up by exactly what that line produces. Before you submit, the summary shows the clip count, the number of new scripts, the products involved, and the estimated credits. All four are computed from the same function the server uses to expand the plan, so what you see is what runs.

## Retries and regenerations are not the same thing

Both consume credits. Only one of them is your decision.

A **retry** happens when a clip failed — the provider errored, the render timed out, or the quality gate rejected the result. It re-attempts the same plan item. Your target count does not move; you asked for twenty clips and you still want twenty.

A **regeneration** is you saying "make me another version of this." It produces a new clip that keeps its link back to the one it came from, and the original stays exactly where it was so you can compare them. This does add to what was produced, because you asked for it.

Every unit of work — product analysis, script writing, rendering, retries, regenerations — is recorded separately with its own credit cost. That is what makes cost per _delivered_ clip a number you can actually compute at the end of a batch, rather than a number you estimate from the total spend.

## Failure stays local

A batch of eighty clips will not be perfect. A product link goes dead, a spec sheet contradicts the images, one render times out.

None of that should stop the other seventy-nine. A product whose material cannot be read is paused on its own and marked as needing input; its lines are skipped and the rest of the batch runs. A clip that fails is marked failed with the reason attached and can be retried by itself. Automatic retries have a hard limit, so a broken input cannot quietly burn a budget in a loop.

You can also cancel what has not started yet without touching what has already been delivered. Cancelling a batch stops the queued and in-flight work; the clips that already passed the gate stay in review where you left them.

## Generated is not selected

These two get conflated constantly, and keeping them apart is most of what makes a handover trustworthy:

1. **Generated** means the clip exists and passed the quality gate.
2. **Selected** means a person watched it and decided to use it.

A generated clip is not a decision. The export manifest only ever contains clips a person selected, and it states, per asset, the reference number, product, variant, language, market, talent, and the disclosure line that goes with it.

What the manifest deliberately does not contain is the storefront link. Attaching an asset to a listing, checking stock, and posting it are the publisher's job, not ours — we make the video and say exactly what it is. Drawing that line is what keeps the handover honest: nothing here can claim an asset is ready to sell when nobody has checked the listing.
