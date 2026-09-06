import { db, closeDatabase } from "@/database";
import { users } from "@/database/schema";
import { eq } from "drizzle-orm";

async function main() {
  const emailArg = process.argv.find((arg) => arg.startsWith("--email="));

  if (!emailArg) {
    throw new Error(
      "Please provide an email address using --email=<your-email>",
    );
  }

  const adminEmail = emailArg.split("=")[1];

  const result = await db
    .update(users)
    .set({ role: "super_admin" })
    .where(eq(users.email, adminEmail))
    .returning();

  if (result.length === 0) {
    console.info(
      `\x1b[32mInfo: Please create the user first, or check for typos in the email address.\x1b[0m`,
    );
    throw new Error(`User with email "${adminEmail}" not found.`);
  }

  console.log(
    `\x1b[32mSuccess: User "${adminEmail}" has been promoted to super_admin.\x1b[0m`,
  );
}

main()
  .then(async () => {
    // Manually close the connection, otherwise the script will hang
    await closeDatabase();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(`\x1b[31mError: ${err.message}\x1b[0m`);
    // Manually close the connection, otherwise the script will hang
    await closeDatabase();
    process.exit(1);
  });
