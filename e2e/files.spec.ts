import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
import { loginAs } from "./helpers/auth";

test("protects private files and revokes an owner-deleted file", async ({
  page,
  browser,
}) => {
  const owner = await loginAs(page, "user");
  const id = randomUUID();
  const key = `uploads/${owner.id}/${id}.md`;
  const url = `/api/files/content?key=${encodeURIComponent(key)}`;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    await sql`insert into uploads (id, "userId", "fileKey", url, "fileName", "fileSize", "contentType") values (${id}, ${owner.id}, ${key}, ${url}, 'private-notes.md', 5, 'text/markdown')`;
    const anonymous = await browser.newContext();
    expect(
      (await anonymous.request.get(url, { maxRedirects: 0 })).status(),
    ).toBe(401);
    await anonymous.close();
    const foreign = await browser.newContext();
    const foreignLogin = await foreign.request.post("/api/test/session", {
      headers: { "x-e2e-test-secret": process.env.E2E_TEST_SECRET! },
      data: {
        id: "e2e-files-foreign",
        name: "Foreign User",
        email: "files-foreign@e2e.local",
        role: "user",
      },
    });
    expect(foreignLogin.status()).toBe(200);
    expect((await foreign.request.get(url, { maxRedirects: 0 })).status()).toBe(
      404,
    );
    expect((await foreign.request.delete(`/api/files?id=${id}`)).status()).toBe(
      404,
    );
    await foreign.close();
    const before = await page.request.get(url, { maxRedirects: 0 });
    expect(before.status()).toBe(307);
    expect(before.headers()["location"]).toContain("X-Amz-Expires=300");
    expect(before.headers()["cache-control"]).toContain("no-store");
    expect((await page.request.delete(`/api/files?id=${id}`)).status()).toBe(
      204,
    );
    expect((await page.request.get(url, { maxRedirects: 0 })).status()).toBe(
      404,
    );
  } finally {
    await sql`delete from uploads where id = ${id}`;
    await sql.end();
  }
});

test("pages older conversation messages using a stable cursor", async ({
  page,
}) => {
  const user = await loginAs(page, "user");
  const conversationId = randomUUID();
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    await sql`insert into ai_conversations (id, "userId", title) values (${conversationId}, ${user.id}, 'Pagination verification')`;
    for (let index = 0; index < 81; index++) {
      const parts = [{ type: "text", text: `History fixture ${index}` }];
      await sql`insert into ai_messages (id, "conversationId", role, parts, "createdAt") values (${`page-${index}`}, ${conversationId}, 'user', ${JSON.stringify(parts)}::jsonb, ${new Date(Date.UTC(2026, 0, 1, 0, 0, index))})`;
    }
    const firstResponse = await page.request.get(
      `/api/ai/conversations/${conversationId}`,
    );
    const first = await firstResponse.json();
    expect(first.messages).toHaveLength(80);
    expect(first.hasMore).toBe(true);

    const olderResponse = await page.request.get(
      `/api/ai/conversations/${conversationId}?before=${first.messages[0].id}`,
    );
    const older = await olderResponse.json();
    expect(older.messages).toHaveLength(1);
    expect(older.messages[0].parts[0].text).toBe("History fixture 0");
    expect(older.hasMore).toBe(false);
  } finally {
    await sql`delete from ai_conversations where id = ${conversationId}`;
    await sql.end();
  }
});
