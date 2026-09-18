import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { loginAs } from "./helpers/auth";

test("starts a work from a new product and lands on the first step", async ({
  page,
}) => {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });

  await loginAs(page, "user");
  await page.goto("/dashboard/works/new");

  await expect(
    page.getByRole("heading", { name: "New clip", exact: true }),
  ).toBeVisible();

  // A product that does not exist yet is created in the composer, so the
  // operator never leaves the page to come back to it.
  const name = `Playwright product ${Date.now()}`;
  await page.getByRole("tab", { name: "New product" }).click();
  await page.getByLabel("Product name").fill(name);
  await page
    .getByLabel("Reference link")
    .fill("https://example.com/playwright-product");
  await page.getByRole("combobox", { name: "Video length" }).click();
  await page.getByRole("option", { name: "30s" }).click();
  await page.getByRole("combobox", { name: "Speech" }).click();
  await page.getByRole("option", { name: "AI narration" }).click();
  await page
    .getByRole("button", { name: "Start and write the script" })
    .click();

  await expect(page).toHaveURL(/\/dashboard\/works\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  const workId = page.url().split("/").at(-1)!;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const [settings] =
      await sql`select "durationSeconds", "audioMode" from ugc_works where id = ${workId}`;
    expect(settings).toMatchObject({ durationSeconds: 30, audioMode: "tts" });
  } finally {
    await sql.end({ timeout: 5 });
  }

  // The default one-take flow has three named steps, with the first one
  // current until the product has been read.
  const steps = page.getByRole("listitem").filter({ hasText: /^\d/ });
  await expect(
    page.getByText("Product", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.locator('[aria-current="step"]').filter({ hasText: "Product" }),
  ).toBeVisible();
  await expect(steps).toHaveCount(3);

  // Nothing can be generated until a product has actually been read.
  await expect(
    page.getByRole("button", { name: "Confirm and write the script" }),
  ).toBeDisabled();

  await page.goto("/dashboard/works");
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();

  // Status filters hide and restore the work without requiring a new page.
  await page.getByRole("tab", { name: "Finished 0" }).click();
  await expect(page.getByText(name, { exact: true })).toBeHidden();
  await page.getByRole("tab", { name: "All 1" }).click();
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();

  expect(
    problems.filter((text) => !text.includes("Failed to load resource")),
  ).toEqual([]);
});

test("reviews a written script and sends it to the storyboard", async ({
  page,
}) => {
  await loginAs(page, "user");

  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  let workId: string;
  try {
    const [product] = await sql`
      insert into ugc_products ("userId", name, market, images, facts, status)
      values (
        'e2e-user',
        'Playwright serum',
        'US',
        ${sql.json(["https://example.com/serum.png"])},
        ${sql.json({
          summary: "A 30ml serum in a frosted glass bottle.",
          appearance: "Frosted glass, matte black dropper.",
          specs: ["30ml"],
          sellingPoints: ["Lightweight", "Fragrance free"],
          scenarios: ["Morning routine"],
          sources: ["operator brief"],
        })},
        'ready'
      )
      returning id
    `;
    const [script] = await sql`
      insert into ugc_scripts (
        "userId", "productId", template, locale, market,
        title, hook, beats, voiceover, captions, status
      )
      values (
        'e2e-user', ${product.id}, 'spokesperson', 'en', 'US',
        'Serum in fifteen seconds',
        'I stopped buying three serums for this one.',
        ${sql.json([
          {
            start: 0,
            end: 5,
            shot: "Close on the bottle",
            action: "Hands lift the bottle into frame",
            voiceover: "I stopped buying three serums for this one.",
          },
          {
            start: 5,
            end: 15,
            shot: "Talent to camera",
            action: "One drop onto the fingertips",
            voiceover: "One drop, every morning.",
          },
        ])},
        'I stopped buying three serums for this one. One drop, every morning.',
        ${sql.json(["One drop, every morning"])},
        'draft'
      )
      returning id
    `;
    const [work] = await sql`
      insert into ugc_works (
        "userId", title, step, "stepStatus", "productId", "scriptId",
        locale, market, template, "videoMode"
      )
      values (
        'e2e-user', 'Serum work', 'script', 'review', ${product.id},
        ${script.id}, 'en', 'US', 'spokesperson', 'storyboard'
      )
      returning id
    `;
    workId = work.id;
  } finally {
    await sql.end({ timeout: 5 });
  }

  await page.goto(`/dashboard/works/${workId}`);

  await expect(page.getByLabel("Title")).toHaveValue(
    "Serum in fifteen seconds",
  );
  await expect(page.getByText("Close on the bottle")).toBeVisible();

  // Editing is in place, and the save only appears once something changed.
  await expect(page.getByRole("button", { name: "Save" })).toBeHidden();
  await page.getByLabel("Opening line").fill("Three serums, now one.");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "Save" })).toBeHidden();

  await page
    .getByRole("button", { name: "Confirm and draw the storyboard" })
    .click();

  await expect(
    page.locator('[aria-current="step"]').filter({ hasText: "Storyboard" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Drawing the storyboard" }),
  ).toBeDisabled();
});

test("keeps a finished work complete while its script and video version are reviewed", async ({
  page,
}) => {
  await loginAs(page, "user");

  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  let workId: string;
  try {
    const [product] = await sql`
      insert into ugc_products ("userId", name, images, facts, status)
      values (
        'e2e-user',
        'Versioned serum',
        '[]'::jsonb,
        ${JSON.stringify({
          summary: "A finished serum fixture.",
          appearance: "Amber bottle.",
          specs: [],
          sellingPoints: ["Lightweight"],
          scenarios: ["Morning routine"],
          sources: ["fixture"],
        })}::jsonb,
        'ready'
      )
      returning id
    `;
    const [script] = await sql`
      insert into ugc_scripts (
        "userId", "productId", template, locale, market,
        title, hook, beats, voiceover, captions, status
      )
      values (
        'e2e-user', ${product.id}, 'spokesperson', 'en', 'US',
        'The exact V1 script',
        'This wording made V1.',
        ${JSON.stringify([
          {
            start: 0,
            end: 7,
            shot: "Close product shot",
            action: "Show the bottle",
            camera: "Handheld phone camera",
            voiceover: "This wording made V1.",
          },
          {
            start: 7,
            end: 15,
            shot: "Product detail",
            action: "Turn the bottle to show its shape",
            camera: "Slow handheld push-in",
            voiceover: "",
          },
        ])}::jsonb,
        'This wording made V1.',
        ${JSON.stringify(["This wording made V1."])}::jsonb,
        'ready'
      )
      returning id
    `;
    const [work] = await sql`
      insert into ugc_works (
        "userId", title, step, "stepStatus", "productId", "scriptId",
        locale, market, template
      )
      values (
        'e2e-user', 'Finished version work', 'script', 'review',
        ${product.id}, ${script.id}, 'en', 'US', 'spokesperson'
      )
      returning id
    `;
    workId = work.id;
    const [clip] = await sql`
      insert into ugc_clips (
        "userId", "productId", "scriptId", "workId", version, reference,
        locale, market, template, status, "videoUrl", "durationMs"
      )
      values (
        'e2e-user', ${product.id}, ${script.id}, ${work.id}, 1,
        'VW-E2E-V1', 'en', 'US', 'spokesperson', 'ready',
        '/api/files/content?key=missing-e2e-video.mp4', 15000
      )
      returning id
    `;
    await sql`
      update ugc_works set "clipId" = ${clip.id} where id = ${work.id}
    `;
    for (const [position, startMs, endMs] of [
      [0, 0, 7000],
      [1, 7000, 15000],
    ]) {
      const [segment] = await sql`
        insert into ugc_work_segments ("workId", "scriptId", position, "startMs", "endMs")
        values (${work.id}, ${script.id}, ${position}, ${startMs}, ${endMs}) returning id
      `;
      const [take] = await sql`
        insert into ugc_work_takes ("segmentId", version, status, "videoUrl")
        values (${segment.id}, 1, 'ready', '/api/files/content?key=missing-e2e-shot.mp4') returning id
      `;
      await sql`update ugc_work_segments set "activeTakeId" = ${take.id} where id = ${segment.id}`;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  await page.goto(`/dashboard/works/${workId}`);
  await expect(page.getByText("Video versions", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "V1 Current" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Generate new version" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Generate new version" }).click();
  await expect(page.getByRole("heading", { name: "Prepare V2" })).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Video model" }),
  ).toContainText("Hailuo H3");
  await expect(page.getByLabel("Title")).toHaveValue("The exact V1 script");
  await page.getByRole("button", { name: "Cancel" }).click();
  await page
    .getByRole("button", { name: "Script used for this version" })
    .click();
  await expect(page.getByText("The exact V1 script")).toBeVisible();

  await page.goto("/dashboard/works");
  const card = page
    .getByRole("listitem")
    .filter({ hasText: "Finished version work" });
  await expect(card.getByText("Video · Finished")).toBeVisible();
  await expect(
    card.getByText("Current version: V1", { exact: false }),
  ).toBeVisible();

  await page.goto(`/dashboard/works/${workId}`);
  await expect(
    page.getByRole("button", { name: /Regenerate shot/ }),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: /Regenerate shot/ })
    .first()
    .click();
  await expect(
    page.getByText("A new take is generating for this shot."),
  ).toBeVisible();
  const verify = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const takes = await verify`
      select s.position, t.version, t.status from ugc_work_segments s
      join ugc_work_takes t on t.id = s."activeTakeId"
      where s."workId" = ${workId} order by s.position
    `;
    expect(takes).toMatchObject([
      { position: 0, version: 2, status: "pending" },
      { position: 1, version: 1, status: "ready" },
    ]);
  } finally {
    await verify.end({ timeout: 5 });
  }
});

test("shows a shot whose audio missed the line instead of losing the work to it", async ({
  page,
}) => {
  await loginAs(page, "user");

  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  let workId: string;
  try {
    const [product] = await sql`
      insert into ugc_products ("userId", name, images, facts, status)
      values (
        'e2e-user',
        'Reviewed shot serum',
        '[]'::jsonb,
        ${JSON.stringify({
          summary: "A fixture whose shot came back off-script.",
          appearance: "Amber bottle.",
          specs: [],
          sellingPoints: ["Lightweight"],
          scenarios: ["Morning routine"],
          sources: ["fixture"],
        })}::jsonb,
        'ready'
      )
      returning id
    `;
    const [script] = await sql`
      insert into ugc_scripts (
        "userId", "productId", template, locale, market,
        title, hook, beats, voiceover, captions, status
      )
      values (
        'e2e-user', ${product.id}, 'spokesperson', 'en', 'US',
        'Off-script take', 'One pass and it is done.',
        ${JSON.stringify([
          {
            start: 0,
            end: 8,
            shot: "Close product shot",
            action: "Show the bottle",
            camera: "Handheld phone camera",
            voiceover: "One pass and it is done.",
          },
          {
            start: 8,
            end: 15,
            shot: "Product detail",
            action: "Turn the bottle",
            camera: "Slow push-in",
            voiceover: "",
          },
        ])}::jsonb,
        'One pass and it is done.',
        ${JSON.stringify(["One pass and it is done."])}::jsonb,
        'ready'
      )
      returning id
    `;
    const [work] = await sql`
      insert into ugc_works (
        "userId", title, step, "stepStatus", "productId", "scriptId",
        locale, market, template
      )
      values (
        'e2e-user', 'Off-script work', 'video', 'review',
        ${product.id}, ${script.id}, 'en', 'US', 'spokesperson'
      )
      returning id
    `;
    workId = work.id;
    for (const [position, startMs, endMs, status, transcript] of [
      [0, 0, 8000, "review", "Something else entirely."],
      [1, 8000, 15000, "ready", null],
    ] as const) {
      const [segment] = await sql`
        insert into ugc_work_segments ("workId", "scriptId", position, "startMs", "endMs")
        values (${work.id}, ${script.id}, ${position}, ${startMs}, ${endMs}) returning id
      `;
      const [take] = await sql`
        insert into ugc_work_takes ("segmentId", version, status, "videoUrl", transcript)
        values (
          ${segment.id}, 1, ${status},
          '/api/files/content?key=missing-e2e-shot.mp4', ${transcript}
        )
        returning id
      `;
      await sql`update ugc_work_segments set "activeTakeId" = ${take.id} where id = ${segment.id}`;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  await page.goto(`/dashboard/works/${workId}`);
  await expect(
    page.getByRole("heading", { name: "Shots that need a call" }),
  ).toBeVisible();
  // The footage is on the page, not replaced by an error. Its neighbours are
  // shown too, because that is the context for judging whether to keep it.
  await expect(page.locator("video")).toHaveCount(2);
  await expect(page.getByText("Something else entirely.")).toBeVisible();
  await expect(page.getByText("One pass and it is done.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Regenerate shot/ }),
  ).toHaveCount(1);

  await page.getByRole("button", { name: "Keep this take" }).click();
  await expect(
    page.getByRole("heading", { name: "Shots that need a call" }),
  ).toBeHidden();

  const verify = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const takes = await verify`
      select s.position, t.status, t.words from ugc_work_segments s
      join ugc_work_takes t on t.id = s."activeTakeId"
      where s."workId" = ${workId} order by s.position
    `;
    // A kept take keeps its footage but drops the evidence, so composition
    // cannot time the approved line against words nobody said.
    expect(takes).toMatchObject([
      { position: 0, status: "ready", words: [] },
      { position: 1, status: "ready" },
    ]);
  } finally {
    await verify.end({ timeout: 5 });
  }
});
