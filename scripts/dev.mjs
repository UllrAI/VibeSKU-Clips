import { spawn } from "node:child_process";

/**
 * Runs the app and the job worker together.
 *
 * Nothing in the product finishes without the worker: product reading, scripts,
 * storyboards, videos and upload cleanup all run there. Running `next dev` alone
 * leaves every task sitting in the outbox with no consumer, so development runs
 * both processes or neither.
 */
const children = [
  { name: "web", command: "next", args: ["dev"] },
  {
    name: "worker",
    command: process.execPath,
    args: [
      "--watch",
      "--watch-preserve-output",
      "--env-file-if-exists=.env",
      "--import",
      "tsx",
      "scripts/worker.ts",
    ],
  },
].map(({ name, command, args }) => {
  const child = spawn(command, args, {
    stdio: "inherit",
    env: { ...process.env, WORKER_LABEL: name },
  });
  child.once("exit", (code, signal) => {
    if (stopping) return;
    console.error(`\n[dev] ${name} exited (${signal ?? code}); stopping.`);
    stop(code ?? 1);
  });
  return child;
});

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill("SIGTERM");
}

process.once("SIGINT", () => stop(0));
process.once("SIGTERM", () => stop(0));
