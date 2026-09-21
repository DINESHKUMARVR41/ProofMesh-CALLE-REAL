#!/usr/bin/env node
// verify-skill — Node port of the rules that the target repo's validate_repository.py
// enforces on a skills/<name>/ directory. Ported from the real validator so the proxy
// AGREES with it (same pass/fail), rather than guessing. Python is not installed in this
// environment; run the real validator (embeddable Python, against a clone of the target
// repo) before submitting the PR — this is a local pre-check, not a substitute.
//
// Faithful to validate_repository.py's skill rules (validate_skills + the repo-wide
// english-only / repository-name sweeps as they apply to skills/). Differences on
// purpose: this collects ALL failures instead of fail-fast, and keeps ONE advisory
// (secret scan) that the real validator does NOT apply to skills — clearly labelled.

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, extname, basename } from "node:path";

const SLUG = "calle-invoice-recovery";
const SKILL_DIR = join(process.cwd(), "skills", SLUG);

// --- constants mirrored from validate_repository.py ---
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CJK_RE = /[㐀-䶿一-鿿豈-﫿]/;
const TEXT_SUFFIXES = new Set([".md", ".mjs", ".py", ".ts", ".json", ".toml", ".yaml", ".yml"]);
const SKIP_TEXT_FILES = new Set(["uv.lock"]);
const SKIP_TEXT_DIRS = new Set([".venv", "node_modules", ".pytest_cache", "__pycache__", ".mypy_cache", ".ruff_cache"]);
// Built by concatenation (as the validator does) so this file doesn't self-match.
const OLD_SLUG = "awesome-phone-call-" + "skill";
const OLD_STRINGS = ["Awesome Phone Call " + "Skill", OLD_SLUG, "CALLE-AI/" + OLD_SLUG];
const ACTIONABLE_RE = /\b(?:read|use|using|see|open|load|follow|check|consult|refer to|source of truth)\b/i;
const LOCAL_REF_RE = /(?<![A-Za-z0-9_./-])(?:\.\/)?((?:scripts|references)\/[A-Za-z0-9][A-Za-z0-9._/-]*)/g;
const TRAIL = new Set([".", ",", ";", ":", ")", "]", "}", "`", "'", '"']);
const AFTER_STRIP = new Set(["`", "'", '"', ")", "]", " ", "\t"]);

const fails = [];
const warns = [];

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}
function rstrip(s, set) { let i = s.length; while (i > 0 && set.has(s[i - 1])) i--; return s.slice(0, i); }
function lstrip(s, set) { let i = 0; while (i < s.length && set.has(s[i])) i++; return s.slice(i); }
function stripQuotes(v) {
  // Python: value.strip('"').strip("'") — remove ALL leading/trailing " then ALL ' .
  let i = 0, j = v.length;
  while (i < j && v[i] === '"') i++; while (j > i && v[j - 1] === '"') j--;
  v = v.slice(i, j); i = 0; j = v.length;
  while (i < j && v[i] === "'") i++; while (j > i && v[j - 1] === "'") j--;
  return v.slice(i, j);
}

// Referenced local files (scripts/… always; references/… only on "actionable" lines).
function referencedLocalPaths(text) {
  const out = new Set();
  for (const line of text.split(/\r?\n/)) {
    LOCAL_REF_RE.lastIndex = 0;
    let m;
    while ((m = LOCAL_REF_RE.exec(line)) !== null) {
      const raw = rstrip(m[1], TRAIL);
      const parts = raw.split("/");
      if (parts.length < 2) continue;
      if (parts[0] !== "scripts" && parts[0] !== "references") continue;
      if (parts.some((p) => p === "" || p === "." || p === "..")) continue;
      if (parts[0] === "references") {
        const after = lstrip(line.slice(m.index + m[0].length), AFTER_STRIP);
        if (!(ACTIONABLE_RE.test(line) || after.startsWith(":"))) continue;
      }
      out.add(raw);
    }
  }
  return [...out];
}

// ---- run ----
if (!existsSync(SKILL_DIR)) {
  console.error(`verify-skill FAILED — skills/${SLUG}/ does not exist (skill not scaffolded).`);
  process.exit(1);
}
const dirName = basename(SKILL_DIR);

// 1. directory name is a lowercase slug
if (!SLUG_RE.test(dirName)) fails.push(`skill directory is not a lowercase slug: ${dirName}`);

// 2. README.md forbidden in a skill dir (move long-form guidance to docs/)
if (existsSync(join(SKILL_DIR, "README.md"))) fails.push("skill directory must not include README.md; move long-form guidance to docs/");

// 3. SKILL.md required
const skillPath = join(SKILL_DIR, "SKILL.md");
let skillText = null;
if (!existsSync(skillPath)) fails.push("missing file: SKILL.md");
else skillText = readFileSync(skillPath, "utf8");

// 4–9. frontmatter + name/description rules
if (skillText != null) {
  if (!skillText.startsWith("---\n")) {
    fails.push("SKILL.md: missing YAML frontmatter (must start with '---')");
  } else {
    const end = skillText.indexOf("\n---", 4);
    if (end === -1) {
      fails.push("SKILL.md: unterminated YAML frontmatter");
    } else {
      const block = skillText.slice(4, end).trim();
      const fm = {};
      for (const line of block.split("\n")) {
        const s = line.trim();
        if (!s || s.startsWith("#")) continue;
        if (!line.includes(":")) { fails.push(`SKILL.md: invalid frontmatter line: ${line}`); continue; }
        const idx = line.indexOf(":");
        fm[line.slice(0, idx).trim()] = stripQuotes(line.slice(idx + 1).trim());
      }
      const name = fm.name, description = fm.description;
      if (!name) fails.push("SKILL.md frontmatter: missing/empty 'name'");
      if (!description) fails.push("SKILL.md frontmatter: missing/empty 'description'");
      if (name && name !== dirName) fails.push(`SKILL.md 'name' (${name}) must match directory '${dirName}'`);
      if (name && !SLUG_RE.test(name)) fails.push(`SKILL.md 'name' is not a lowercase slug: ${name}`);
      if (description && description.length < 40) fails.push("SKILL.md 'description' is too short (min 40 chars)");
      if (description && !description.toLowerCase().includes("phone") && !description.toLowerCase().includes("call")) {
        fails.push("SKILL.md 'description' should mention a phone/call workflow");
      }
    }
  }
  // 11. every scripts/… (and actionable references/…) path referenced in SKILL.md must exist under the skill dir
  for (const ref of referencedLocalPaths(skillText)) {
    const p = join(SKILL_DIR, ref);
    if (!existsSync(p) || !statSync(p).isFile()) fails.push(`SKILL.md references missing local file: ${ref}`);
  }
}

// 10. references/ dir + safety.md + examples.md
const refDir = join(SKILL_DIR, "references");
if (!existsSync(refDir) || !statSync(refDir).isDirectory()) {
  fails.push("skill must include a references/ directory");
} else {
  for (const f of ["safety.md", "examples.md"]) {
    if (!existsSync(join(refDir, f))) fails.push(`missing file: references/${f}`);
  }
}

// 12. repo-wide sweeps as applied to skill files: CJK, old repository-name strings.
for (const f of walk(SKILL_DIR)) {
  const relParts = f.slice(SKILL_DIR.length + 1).split(/[\\/]/);
  if (relParts.some((p) => SKIP_TEXT_DIRS.has(p))) continue;
  if (SKIP_TEXT_FILES.has(basename(f)) || !TEXT_SUFFIXES.has(extname(f))) continue;
  const txt = readFileSync(f, "utf8");
  const rel = relParts.join("/");
  if (CJK_RE.test(txt)) fails.push(`${rel}: contains CJK characters (repo is English-only)`);
  for (const s of OLD_STRINGS) if (txt.includes(s)) fails.push(`${rel}: contains old repository name "${s}"`);
  // advisory only — NOT a repo-validator rule for skills, but useful before a public PR:
  if (/(eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+|sk-[A-Za-z0-9]{20,}|sb_secret_[A-Za-z0-9]+|SERVICE_ROLE_KEY\s*=\s*\S+)/.test(txt)) {
    warns.push(`${rel}: looks like it may contain a secret/credential`);
  }
}

// ---- report ----
for (const w of warns) console.warn(`  [advisory] ${w}`);
if (fails.length) {
  console.error(`verify-skill FAILED — ${fails.length} problem(s):`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`verify-skill OK — skills/${SLUG}/ passes the repo validator's skill rules${warns.length ? ` (${warns.length} advisory warning(s) above)` : ""}.`);
