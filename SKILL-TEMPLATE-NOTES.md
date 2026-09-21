# SKILL-TEMPLATE-NOTES

Task 1 (`read-skill-template`) output. Source: `github.com/CALLE-AI/awesome-phone-call-agents`
(README, CONTRIBUTING.md, `scripts/validate_repository.py`, and the merged skills
`skills/call-reminder/` and `skills/google-form-callback/`). Read on 2026-07-27.

**Rule: where the repo contradicts `tasks-skill.json`, the repo wins.** Contradictions are
listed at the bottom.

---

## Required folder layout (verbatim requirements)

Skills live at `skills/<skill-name>/`. Per the validator, a skill directory MUST contain:

```
skills/<skill-name>/
├── SKILL.md                 # required, with YAML frontmatter
└── references/
    ├── safety.md            # REQUIRED FILE (validator checks for it)
    └── examples.md          # REQUIRED FILE (validator checks for it)
```

`scripts/` and `assets/` are allowed/expected for callable skills but are not the two
files the validator hard-requires. The README's generic template only shows
`references/` — the **validator is stricter**: it wants `references/safety.md` and
`references/examples.md` by name.

For us: `skills/calle-invoice-recovery/` with `SKILL.md`, `references/safety.md`,
`references/examples.md`, plus `scripts/` (dry-run) and `references/` extras
(example dataset, transcripts, adaptation guide) as additional files.

## SKILL.md frontmatter (verbatim)

Minimum required (CONTRIBUTING + validator):

```yaml
---
name: example-skill
description: What this skill does and when to use it.
---
```

- **Required keys: `name`, `description`.** Both merged skills also add `license: MIT`.
- `name` **must equal the directory slug** and be **lowercase kebab-case**. So our
  frontmatter must be `name: calle-invoice-recovery` (matches `skills/calle-invoice-recovery/`).
- Frontmatter must start with `---\n` and end with `\n---`; the validator parses it
  line-by-line splitting on the first colon (keep values on one line, simple `key: value`).
- `description` should say what it does AND when to use it (see call-reminder's, which is
  one long sentence packed with trigger phrases).

## Body section conventions (from merged skills)

`call-reminder` headings: When To Use · When Not To Use · Core Workflow · Runtime Workflow ·
CLI Bootstrap Reference · Required Fields · Safety Rules · Output Format.
`google-form-callback` headings: When To Use · When Not To Use · Template Contract ·
Workflow · Execution Mode · Scripts · Provider Boundary · Result Writeback · Safety Rules ·
References. → Our SKILL.md should follow this shape (When To Use / When Not To Use /
Workflow / Safety Rules / Output Format / References).

## Validation the repo runs on PRs

- **`python3 scripts/validate_repository.py`** (required before PR). Verified by reading
  the source (`validate_skills()` + the repo-wide English-only / old-name sweeps). The
  rules that make a `skills/<name>/` directory pass or fail are exactly:
  - `SKILL.md`, `references/` (a directory), `references/safety.md`, `references/examples.md` all present.
  - **`README.md` is FORBIDDEN** in a skill dir → long-form guidance goes in **`docs/`** (which IS allowed). We keep the operator guide at `docs/guide.md`.
  - Frontmatter starts with `---\n`, terminated by the first `\n---`; simple `key: value` lines (blank and `#` lines skipped; value has surrounding quotes stripped).
  - `name` + `description` present; `name` **==** the directory name; `name` matches `^[a-z0-9]+(-[a-z0-9]+)*$`.
  - `description` length **≥ 40** and contains `"phone"` or `"call"` (case-insensitive substring).
  - Every `scripts/…` path — and every `references/…` path on an "actionable" line (read/use/see/…/`:`) — referenced **in SKILL.md** must exist under the skill dir.
  - No CJK characters (ranges `㐀-䶿`, `一-鿿`, `豈-﫿`) in `.md .mjs .py .ts .json .toml .yaml .yml` files.
  - No old repo-name strings ("Awesome Phone Call Skill" / "awesome-phone-call-skill" / "CALLE-AI/awesome-phone-call-skill").
  - **NOT enforced on skills** (earlier notes were wrong): CRLF / trailing-whitespace / final-newline, secrets/PII/E.164, a file allowlist, file-size, or required section headings. (We still keep LF via `.gitattributes` and scan for secrets as an *advisory* — just not because the validator demands it.)
- **`python3 scripts/check_branch_name.py --branch <name>`** — branch names follow
  `docs/git-naming-conventions.md`: `<type>/<short-kebab-summary>`.

**Local validation (Python is not installed here):** **`pnpm verify-skill`**
(`scripts/verify-skill.mjs`) is a **faithful port of the skill rules above**, confirmed to
agree with the real validator (both pass on our skill). It is the authoritative local
list — trust it over prose. Still run the real `validate_repository.py` with Python
(embeddable Python in the scratchpad, against a clone of the target repo) before
submitting the PR, since the port covers only the skill-scoped rules, not the whole repo.

## Safety expectations the maintainers stated (must appear in our safety.md)

From CONTRIBUTING + `call-reminder/references/safety.md` structure:
- **Explicit intent / consent** — act only on a genuine, user-authorized request; document
  the outreach basis; do not call a third party without a stated consent basis.
- **E.164 phone numbers only.** Examples must use the reserved fictional range
  (`+1555010xxxx`, i.e. 555-01xx) — never a real number.
- **Mask phone numbers (and, for us, client names) in summaries and logs.**
- **Never expose credentials** — API keys, OAuth/access/refresh tokens, session cookies,
  callback URLs, confirmation tokens.
- **No hidden recurrence; block duplicate jobs; provide cancellation/rollback.**
- **Runtime boundary** — one call per authorized run; human approval before any call.
- **Sensitive domains** (medical/legal/financial/emergency) handled carefully — relevant to
  us because debt collection is regulated and varies by jurisdiction.
- **Callable code needs a dry-run / fake path**; masked or fictional data in examples;
  no secrets/PII committed.

---

## Contradictions to resolve (repo wins)

1. **`references/` is not free-form.** `tasks-skill.json` → `reference-materials` describes
   references/ as "example invoice dataset + four transcripts + adaptation guide," but the
   **validator requires `references/safety.md` and `references/examples.md` by name.**
   Resolution: put the safety content in `references/safety.md`, the transcripts/worked
   examples in `references/examples.md`, and add the dataset + adaptation guide as extra
   files (e.g. `references/example-invoices.md`, `references/adaptation.md`). The
   `safety-and-consent` task's content is what goes in `safety.md`.
2. **Fictional number range is fixed.** Use `+1555010xxxx` (555-01xx reserved), not arbitrary
   fake numbers, to match repo convention and pass review.
3. **LF endings** — we normalize to LF via `.gitattributes` (`* text=auto eol=lf`). NOTE:
   the real validator does **not** actually enforce line endings on skill files (the earlier
   claim that it catches CRLF as trailing whitespace was wrong — that check is Dify-only).
   We keep LF anyway for hygiene, not to pass the validator.
4. **English-only** — no CJK anywhere (already fine; noting for the validator).
5. **Region/language**: examples and adaptation guide should cite the CALL-E supported
   regions/languages (US, SG, MY, IN[en/hi], AE[en/ar], AU, CA, GB, VN, DE[en/de], JP, FR,
   MX, BR, ID, PH, KE) — and our demo is SG/English (Bangladesh/Bengali unsupported).
