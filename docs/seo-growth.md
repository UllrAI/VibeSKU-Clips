# SEO growth operations

This runbook keeps search, product analytics, and third-party estimates separate
while giving maintainers one repeatable workflow for the public marketing site.
The reference deployment serves it at `clips.ullrai.com`; forks substitute their
own origin everywhere this document names one.

## Measurement contract

| Source                | Use                                                                  | Do not use it for                                                 |
| --------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Google Search Console | Google impressions, clicks, queries, pages, indexing                 | Sessions or conversions                                           |
| Bing Webmaster Tools  | Bing impressions, clicks, crawl and index status                     | Google performance                                                |
| Umami                 | First-party visits, referrers, journeys, named conversion events     | Billing truth or historical traffic before the dedicated property |
| TabAPI                | External SERP/backlink discovery and directional authority estimates | First-party traffic totals                                        |

Never add these sources into one traffic number. Use complete comparable periods,
record the data extraction date, and annotate releases before comparing trends.

## Index inventory and baseline

The public sitemap currently expects 21 canonical URLs while billing is enabled:

| Template                            | English | Simplified Chinese | Expected total |
| ----------------------------------- | ------: | -----------------: | -------------: |
| Homepage and public marketing pages |       8 |                  8 |             16 |
| Blog posts                          |       3 |                  2 |              5 |
| Total                               |      11 |                 10 |             21 |

The eight localized marketing routes are `/`, `/features`, `/pricing`, `/about`,
`/contact`, `/privacy`, `/terms`, and `/blog`. Two articles are published in
both locales; the production guide is English-only and is exposed to Chinese
readers through the source-locale fallback rather than a machine translation.

The sitemap intentionally excludes `/api/*`, `/auth/*`, `/dashboard/*`,
`/device`, `/login`, `/signup`, and `/payment-status`. Those paths remain
non-indexable through robots rules and page metadata where applicable.

After every release that changes routes or metadata:

1. Fetch `/robots.txt` and `/sitemap.xml`; compare sitemap URLs with the inventory.
2. Inspect the homepage, features, blog index, both locales of one translated
   article, the English-only production guide, and `/login` in GSC and Bing.
3. Confirm each public page returns 200, a self-canonical, the intended locale,
   and reciprocal `hreflang` where a translation exists.
4. Confirm every article has one H1 and valid Article plus BreadcrumbList JSON-LD.
5. Record submitted, indexed, excluded, and error counts every 28 days.

Owner: repository maintainer. Review cadence: every 28 complete days.

## Keyword-to-page map

One primary intent is assigned to each page. Related phrases support the primary
intent; they must not trigger a second near-duplicate page.

| Primary intent                          | Buyer stage    | Canonical page                               | Role and conversion                        |
| --------------------------------------- | -------------- | -------------------------------------------- | ------------------------------------------ |
| guided UGC video production             | Implementation | `/blog/ugc-clip-production-guide`            | Pillar guide; signup click                 |
| how to structure a 15-second UGC ad     | Consideration  | `/blog/fifteen-second-ugc-structure`         | Format spoke; continue to the pillar       |
| localising short video for a new market | Consideration  | `/blog/language-and-market-are-two-settings` | Localisation spoke; continue to the pillar |
| AI UGC video generator for product ads  | Decision       | `/features`                                  | Capability summary; signup click           |
| AI UGC video generator pricing          | Decision       | `/pricing`                                   | Plan decision; payment start               |
| VibeSKU Clips                           | Navigational   | `/`                                          | Brand hub; signup click                    |

The production guide is the hub: it links to both spokes, and each spoke
links back to it and to the relevant product page. Chinese content is published
only when it is fully localized; English-only pages do not emit fake Chinese
alternates.

## Umami event definitions

Production uses a dedicated website ID and a domain filter matching the public
origin. Forks and local deployments must create separate Umami websites.

| Event                                  | Fires when                                                       | Useful dimensions                          |
| -------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------ |
| `cta_click`                            | A marketing call to action is clicked                            | `location`                                 |
| `signup_click`                         | A maintained signup CTA is clicked                               | `source`                                   |
| `signup_submit` / `login_submit`       | Auth form submission starts                                      | `method`                                   |
| `signup_link_sent` / `login_link_sent` | Magic-link request succeeds                                      | `method`                                   |
| `signup_success`                       | Better Auth creates a new user and follows its new-user callback | —                                          |
| `pricing_view`                         | Pricing options mount                                            | —                                          |
| `payment_start`                        | A checkout session succeeds before redirect                      | `tier_id`, `payment_mode`, `billing_cycle` |
| `payment_success`                      | Controlled payment status reaches success                        | `payment_mode`                             |

After deployment, view the production HTML and confirm exactly one tracker, the
dedicated website ID, and a `data-domains` value matching the public origin.
Trigger one CTA event, confirm it arrives, then review hostname and events after
seven complete days. Historical aggregate data from a shared property is not a
baseline.

## Qualified discovery and backlink campaign

The audience is people who need a reliable product-video workflow: TikTok Shop
sellers, creative leads, and the operators who assemble handover folders. Write
for them or do not publish. Campaign links use
`utm_source=<surface>&utm_medium=referral&utm_campaign=seo_growth_2026q4`.
No paid links, mass submission, reciprocal networks, or generic guest posts.

`Ready` means the public submission route is known and the asset exists; it does
not mean a submission has been sent. Anything requiring a maintainer profile,
community membership, or editorial judgement is logged before it is sent.

| Prospect                          | Relevance / editorial bar                                   | Contact path                     | Target asset               | Status                                  |
| --------------------------------- | ----------------------------------------------------------- | -------------------------------- | -------------------------- | --------------------------------------- |
| Product Hunt                      | Product discovery; launch assets and an active maker needed | Launch dashboard                 | Production demo            | Needs launch package                    |
| Indie Hackers                     | Builder audience; transparent numbers expected              | Community post                   | Workflow write-up          | Needs outcome data from a real run      |
| Reddit r/ecommerce, r/dropship    | Exact seller audience; strict self-promotion norms          | Community post after rule review | Production guide           | Needs rule review and a useful summary  |
| TikTok Shop seller communities    | Direct buyer audience; practitioner tone required           | Public seller forums and groups  | 15-second structure spoke  | Needs a member account in good standing |
| E-commerce operations newsletters | Editorial audience for process content                      | Editor pitch                     | Production guide           | Needs a shortlist of live newsletters   |
| Creative agency communities       | Buys volume video; interested in review and handover        | Community post                   | Export and handover story  | Needs a case study                      |
| DEV Community / Hashnode          | Technical audience for the pipeline architecture            | Author dashboard                 | Pipeline architecture post | Ready once that post is written         |
| AI tool directories               | Discovery intent; quality varies sharply                    | Individual submission forms      | Homepage + features        | Shortlist maintained directories only   |
| AlternativeTo                     | Comparison discovery; community moderation                  | Add/suggest application flow     | Production demo            | Verify category fit                     |

For every action, record: date, exact surface, asset, campaign URL, submitter,
outcome (`submitted`, `accepted`, `declined`, or `no response`), and any stale
URL correction. The 90-day comparison uses qualified referring domains, Umami
referral visits, `cta_click`, and branded search — not backlink count alone.

## Review schedule

| Date       | Review                                                                                 |
| ---------- | -------------------------------------------------------------------------------------- |
| 2026-09-15 | Sitemap processing, production Umami host isolation, first events                      |
| 2026-10-20 | Six complete weeks of production-guide impressions, CTR, and position                  |
| 2026-11-24 | Twelve weeks of cluster impressions, non-brand queries, top-20 pages, assisted signups |
| 2026-12-08 | 90-day authority campaign: qualified referring domains and referral conversions        |
