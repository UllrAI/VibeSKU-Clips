---
name: script-judges
description: A four-judge adversarial panel for short-video script lines (UGC ads, talking-head, mini-drama, 口播/带货台词). Every judge owns exactly one axis — retention pacing, spoken-not-written voice, freshness, structure — and tears the script apart BEFORE any generation money is spent, then rewrites the lines so they sound spoken, not written. Use when the user writes or reviews short-video scripts, voiceover lines, hooks, or UGC ad copy, or asks "why does my script sound like an ad".
license: AGPL-3.0-only
compatibility: Pure-text skill, no binaries required — works in any agent host. Pairs with a local ClipForge instance (apply rewrites via its scripts PATCH API or the in-app judge panel), but stands alone for any script work.
metadata:
  {
    "version": "0.8.83",
    "homepage": "https://github.com/xixihhhh/clipforge",
    "keywords": "script-review, ugc-ads, hook-writing, short-video, copywriting, 口播, 带货脚本, 台词, judge-panel",
    "openclaw":
      {
        "emoji": "⚖️",
        "homepage": "https://github.com/xixihhhh/clipforge",
        "requires": {},
      },
  }
---

# Script judges — tear the lines apart before you spend a cent

Video models render a bad script exactly as pretty as a good one. Once the footage passes as human, retention lives or dies on whether the LINES sound spoken or written. So the script gets torn apart first — by narrow, bad-tempered specialists, not one polite generalist.

**How to use**: give the panel a script (numbered lines or per-shot voiceover). Run ALL four judges, each strictly from its own angle. Then rewrite. Then run the panel again. A script only graduates when every judge passes it.

## The four judges

Play each judge as a separate, single-minded reviewer. Harsh beats kind; a judge that finds nothing is suspicious.

### 1. 节奏官 — the pacing judge
Owns exactly one thing: does the viewer stay?
- The first line is a death-penalty checkpoint: if it wouldn't stop a thumb mid-scroll, the script is dead — no other virtue can save it.
- Every line must make the next line wanted. Flag any sentence that answers a question nobody asked.
- Flag long winding sentences and low-information filler. Spoken lines are short.

### 2. 口语官 — the spoken-voice judge
Owns exactly one thing: does it sound SAID, not WRITTEN?
- Hooks start mid-conversation — the viewer scrolled in halfway. "大家好 / 今天给大家介绍 / Hi everyone" openers are instant kills.
- Filler words ("就是", "说真的", "I mean") and one half-finished thought are GOOD — sparingly, once or twice per script.
- Written-prose connectives ("因此 / 综上所述 / therefore / in conclusion") are kills. Punchline endings and life-lesson closers are kills.
- CTAs must sound offhand ("反正链接我放这了" / "anyway, link's down there") — never a slogan.
- The test: read it aloud. Anything that sounds like copy gets rewritten as speech.

### 3. 创意官 — the freshness judge
Owns exactly one thing: has the viewer seen this before?
- Flag template openers, worn-out memes, and any line that every competing video in the niche would also say.
- Flag "safe" claims that could describe any product. Specifics beat adjectives; one concrete detail beats three superlatives.

### 4. 结构官 — the structure judge
Owns exactly one thing: does the whole thing build and land?
- Setup → escalation → landing must actually escalate. Flag scripts that plateau after the hook.
- Endings that land on a lesson, a moral, or a golden line are violations — end where the thought trails off or gets interrupted.
- A slogan-shaped CTA is a violation (that's also the voice judge's kill — they agree on this one).

## Feeding the judges (calibration corpus)

Judges are only as sharp as what they're fed. Before serious use, paste calibration material below each judge's section in your working copy:

- Transcripts of creators whose videos actually stop YOUR thumb — hooks, full voiceovers, topic choices.
- A "proven scripts" baseline: scripts (yours or studied) behind videos with real performance numbers.

**The iron rule — easy to get backwards**: at least one judge (the spoken-voice judge) must be fed ONLY real creators' raw transcripts — never award-winning ad copy. UGC lines are not supposed to sound well-written; a judge calibrated on polished copywriting will "improve" every script into an ad, which is the exact failure this panel exists to prevent.

## Rewrite rules

- Keep the meaning, the selling points, and every factual claim. Change only HOW it's said. Never add new efficacy/price claims (ad-law red line).
- Keep each rewritten line within ±20% of the original length — voiceover duration is usually pinned to shot slots by TTS.
- Rough beats polished. If it reads like copy, rewrite it as speech.
- Across a batch, vary the person, the setting and the phrasing patterns — repetition is the biggest tell.
- If the hook wouldn't hold you, say so BEFORE anything gets generated. If a claim isn't supported by the product, flag it.

## With ClipForge

ClipForge ships this panel built in: the script page's ⚖️ judge-panel button runs all four judges in one LLM call and applies rewrites through `PATCH /api/project/{id}/scripts` (`shotTexts`). As an agent you can do the same: `POST /api/project/{id}/script-judge { scriptId, llmConfig }` returns `{ verdicts, rewrites, summary }`, then PATCH the rewrites you accept. Judging is cheap (one text call); generation is not — always judge first.
