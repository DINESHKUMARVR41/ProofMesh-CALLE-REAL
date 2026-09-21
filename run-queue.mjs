#!/usr/bin/env node
// run-queue.mjs — unattended build runner for the hackathon queue.
//
// Feeds tasks.json to Claude Code headlessly: fresh context per task (each task
// re-reads CLAUDE.md and SPEC.md from disk), runs the verify commands after each
// task, and HALTS on the first failure. A wrong assumption in task 3 that tasks
// 4-12 build on is the real failure mode, so we stop rather than continue.
//
// Usage:
//   node run-queue.mjs --dry-run     # print the prompts, run nothing
//   node run-queue.mjs               # execute the queue
//   node run-queue.mjs --from 4      # resume starting at task 4 (1-based)
//   node run-queue.mjs --to 1        # stop after task 1 (upper bound, inclusive)
//   node run-queue.mjs --tasks tasks-skill.json   # run a different task file
//
// Outputs: RUN-REPORT.md (summary), NOTES.md (decisions), BLOCKED.md (if it
// stopped to ask), and .claude-runs/<id>.log (full per-task logs).

import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = join(ROOT, ".claude-runs");

// ---- args -----------------------------------------------------------------
const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const fromIdx = argv.indexOf("--from");
const FROM = fromIdx !== -1 ? parseInt(argv[fromIdx + 1], 10) : 1; // 1-based
const toIdx = argv.indexOf("--to");
const TO = toIdx !== -1 ? parseInt(argv[toIdx + 1], 10) : Infinity; // stop after this task (inclusive)
const tasksIdx = argv.indexOf("--tasks");
const TASKS_FILE = tasksIdx !== -1 ? argv[tasksIdx + 1] : "tasks.json";
const SKIP_DOC_CHECK = argv.includes("--skip-doc-check");

// The Claude Code CLI invocation used to run a task headlessly. Overridable so
// the runner is not tied to one machine's setup. Execution is only reached
// outside --dry-run.
const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";

// ---- load queue -----------------------------------------------------------
const specPath = join(ROOT, TASKS_FILE);
if (!existsSync(specPath)) {
  console.error("tasks.json not found next to run-queue.mjs");
  process.exit(1);
}
const queue = JSON.parse(readFileSync(specPath, "utf8"));
const verify = Array.isArray(queue.verify) ? queue.verify : [];
const tasks = Array.isArray(queue.tasks) ? queue.tasks : [];

if (!tasks.length) {
  console.error("tasks.json has no tasks");
  process.exit(1);
}

// ---- prompt assembly ------------------------------------------------------
function buildPrompt(task, n, total) {
  const verifyLines = verify.length
    ? verify.map((c) => `  - ${c}`).join("\n")
    : "  (none defined)";
  return `You are running ONE task from an unattended build queue: task "${task.id}" (${n} of ${total}).

This is a fresh context. Before touching anything, read ./CLAUDE.md and ./SPEC.md
in full and treat them as binding. Grep for existing patterns before inventing new ones.

## Task: ${task.title}

${task.details}

## Done when
${task.done_when}

## After the task
1. Run each verify command and make sure it passes:
${verifyLines}
2. Stage only the files relevant to this task.
3. Commit with a conventional message (feat:/fix:/chore:/refactor:).
4. git push.

## Guardrails
- CALLE_MODE=mock for this entire queue. Never place a real call. Never set CALLE_MODE=live.
- Never run destructive SQL, never touch production Supabase, never spend CALL-E call credits.
- If the task is ambiguous or you get blocked, STOP and write BLOCKED.md explaining why.
  Do not guess — a wrong assumption here propagates to every later task.
- Do exactly this one task. Do not start the next task.`;
}

// ---- verify runner --------------------------------------------------------
function runVerify(logFile) {
  for (const cmd of verify) {
    log(logFile, `\n$ ${cmd}`);
    const r = spawnSync(cmd, { cwd: ROOT, shell: true, encoding: "utf8" });
    if (r.stdout) log(logFile, r.stdout);
    if (r.stderr) log(logFile, r.stderr);
    if (r.status !== 0) {
      return { ok: false, cmd, code: r.status };
    }
  }
  return { ok: true };
}

// ---- task executor --------------------------------------------------------
function runTask(task, n, total) {
  const prompt = buildPrompt(task, n, total);
  const logFile = join(RUNS_DIR, `${String(n).padStart(2, "0")}-${task.id}.log`);
  log(logFile, `=== task ${n}/${total}: ${task.id} ===\n`);
  log(logFile, prompt + "\n");

  // Headless Claude Code run. -p / --print runs a single prompt non-interactively.
  // --dangerously-skip-permissions: this is an UNATTENDED runner, so the sub-agent
  // cannot stop for tool approvals. Blast radius is contained by design: it runs in
  // a throwaway worktree/branch, CALLE_MODE=mock, against a staging Supabase project,
  // and the task prompt carries explicit guardrails (no live calls, no prod).
  // 20-min per-task timeout so one hung task can't stall the whole queue.
  const r = spawnSync(CLAUDE_BIN, ["-p", "--dangerously-skip-permissions", prompt], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 20 * 60 * 1000,
  });
  if (r.error) {
    if (r.error.code === "ETIMEDOUT") {
      log(logFile, `Task killed: exceeded 20-min timeout (likely stuck/looping).`);
      return { ok: false, reason: "timed out after 20m (likely stuck/looping)" };
    }
    log(logFile, `Failed to spawn ${CLAUDE_BIN}: ${r.error.message}`);
    return { ok: false, reason: `could not spawn ${CLAUDE_BIN}` };
  }
  if (r.stdout) log(logFile, r.stdout);
  if (r.stderr) log(logFile, r.stderr);

  if (existsSync(join(ROOT, "BLOCKED.md"))) {
    return { ok: false, reason: "task wrote BLOCKED.md" };
  }

  const v = runVerify(logFile);
  if (!v.ok) {
    return { ok: false, reason: `verify failed: ${v.cmd} (exit ${v.code})` };
  }
  return { ok: true };
}

// ---- small helpers --------------------------------------------------------
function log(file, msg) {
  appendFileSync(file, msg.endsWith("\n") ? msg : msg + "\n");
}

function writeReport(results) {
  const lines = ["# RUN-REPORT", "", `Tasks attempted: ${results.length}`, ""];
  for (const res of results) {
    const mark = res.ok ? "PASS" : "HALT";
    lines.push(`- [${mark}] ${res.n}. ${res.id}${res.reason ? ` — ${res.reason}` : ""}`);
  }
  writeFileSync(join(ROOT, "RUN-REPORT.md"), lines.join("\n") + "\n");
}

// ---- pre-flight: spec docs must match the repo (master) --------------------
// The tasks build from CLAUDE.md / SPEC.md / tasks.json. If this worktree's copy
// has drifted from master, the queue faithfully builds on stale decisions — this
// bit us once (a worktree ran on a pre-correction SPEC). Halt before running.
function preflightDocCheck() {
  const norm = (s) => s.replace(/\r\n/g, "\n");
  const drifted = [];
  for (const f of ["CLAUDE.md", "SPEC.md", TASKS_FILE]) {
    const master = spawnSync("git", ["show", `master:${f}`], { cwd: ROOT, encoding: "utf8" });
    if (master.status !== 0) continue; // not tracked on master — nothing to compare
    const here = existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f), "utf8") : "";
    if (norm(master.stdout) !== norm(here)) drifted.push(f);
  }
  return drifted;
}

// ---- dry run --------------------------------------------------------------
if (DRY_RUN) {
  console.log(`DRY RUN — ${tasks.length} task(s), starting from #${FROM}. Nothing will execute.\n`);
  console.log(`Verify commands run after each task:`);
  for (const c of verify) console.log(`  - ${c}`);
  console.log(`\nHeadless runner (execute mode): ${CLAUDE_BIN} -p "<prompt>"  [not invoked in dry-run]\n`);
  console.log("=".repeat(72));
  tasks.forEach((task, i) => {
    const n = i + 1;
    if (n < FROM) return;
    if (n > TO) return;
    console.log(`\n### TASK ${n}/${tasks.length}: ${task.id} — ${task.title}\n`);
    console.log(buildPrompt(task, n, tasks.length));
    console.log("\n" + "=".repeat(72));
  });
  console.log(`\nDry run complete. ${tasks.length - (FROM - 1)} task(s) would run. No changes made.`);
  process.exit(0);
}

// ---- execute --------------------------------------------------------------
mkdirSync(RUNS_DIR, { recursive: true });

if (!SKIP_DOC_CHECK) {
  const drifted = preflightDocCheck();
  if (drifted.length) {
    console.error(`PRE-FLIGHT FAILED — spec docs differ between master and this worktree:`);
    for (const f of drifted) console.error(`  - ${f}`);
    console.error(`Reconcile them, or pass --skip-doc-check to override. Nothing ran.`);
    process.exit(1);
  }
  console.log(`Pre-flight OK — CLAUDE.md / SPEC.md / ${TASKS_FILE} match master.`);
}

const results = [];
for (let i = 0; i < tasks.length; i++) {
  const n = i + 1;
  if (n < FROM) continue;
  if (n > TO) break;
  const task = tasks[i];
  console.log(`\n>>> task ${n}/${tasks.length}: ${task.id}`);
  const res = runTask(task, n, tasks.length);
  results.push({ n, id: task.id, ...res });
  if (!res.ok) {
    console.error(`HALT at task ${n} (${task.id}): ${res.reason}`);
    writeReport(results);
    console.error(`Halted. See RUN-REPORT.md and .claude-runs/. Resume with --from ${n}.`);
    process.exit(1);
  }
  console.log(`<<< task ${n} (${task.id}) passed`);
}
writeReport(results);
console.log(`\nAll ${results.length} task(s) passed. See RUN-REPORT.md.`);
