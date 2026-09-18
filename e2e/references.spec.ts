import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { loginAs } from "./helpers/auth";

const BLUEPRINT = {
  format: "street_interview",
  hook: "Stops a stranger mid-sentence with a question they want answered.",
  whyItWorks: "Each answer is shorter than the last, so the list accelerates.",
  beats: [
    {
      role: "hook",
      purpose: "Ask the question the viewer already has.",
      sourceStart: 0,
      sourceEnd: 3.2,
      spokenGist: "Asks what people actually carry every day.",
      events: [
        {
          kind: "cut",
          respondsTo: "the question lands",
          purpose: "Hands the answer straight to the next speaker.",
        },
      ],
    },
    {
      role: "cta",
      purpose: "Close on the one item worth trying.",
      sourceStart: 12,
      sourceEnd: 15,
      spokenGist: "Names the pick and stops.",
      events: [],
    },
  ],
  preserve: ["Answers shorten as the piece runs."],
  redesign: ["The presenter's story about their own commute."],
};

async function seedReference(blueprint: unknown | null): Promise<string> {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const [reference] = await sql`
      insert into ugc_references
        ("userId", title, source, "sourceUrl", "rightsAcknowledgedAt", "durationMs", "aspectRatio", blueprint, status)
      values (
        'e2e-user',
        'Everyday carry street interview',
        'url',
        'https://example.com/clips/everyday-carry',
        now(),
        15000,
        '9:16',
        ${blueprint ? JSON.stringify(blueprint) : null}::jsonb,
        ${blueprint ? "review" : "analyzing"}
      )
      returning id
    `;
    return reference.id as string;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

test("requires a rights statement before a reference can be read", async ({
  page,
}) => {
  await loginAs(page, "user");
  await page.goto("/dashboard/references");

  await page.getByRole("button", { name: "Add a reference" }).first().click();
  await page.getByRole("tab", { name: "Paste a link" }).click();
  await page
    .getByLabel("Link to the video")
    .fill("https://example.com/clips/everyday-carry");
  await page.getByLabel("Name it").fill("Everyday carry street interview");

  const start = page.getByRole("button", { name: "Read this piece" });
  await expect(start).toBeDisabled();
  await page.getByRole("checkbox").check();
  await expect(start).toBeEnabled();
});

test("shows a reading in progress rather than an empty blueprint", async ({
  page,
}) => {
  await loginAs(page, "user");
  const referenceId = await seedReference(null);

  await page.goto(`/dashboard/references/${referenceId}`);
  await expect(page.getByText("Reading this piece")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Make my version" }),
  ).toBeHidden();
});

test("reviews a blueprint and carries it into the work composer", async ({
  page,
}) => {
  await loginAs(page, "user");
  const referenceId = await seedReference(BLUEPRINT);

  await page.goto(`/dashboard/references/${referenceId}`);
  await expect(page.getByText("Street interview2 beats")).toBeVisible();
  await expect(page.getByText(BLUEPRINT.hook)).toBeVisible();
  await expect(page.getByText(BLUEPRINT.preserve[0]!)).toBeVisible();
  await expect(page.getByText(BLUEPRINT.redesign[0]!)).toBeVisible();

  await page.getByRole("link", { name: "Make my version" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/dashboard/works/new\\?referenceId=${referenceId}$`),
  );
  await expect(
    page.getByText("Rebuilding “Everyday carry street interview”"),
  ).toBeVisible();
});
