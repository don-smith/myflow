import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const baselinePath = fileURLToPath(new URL("./skill-structure-baseline.json", import.meta.url));
const cleanFixture = fileURLToPath(new URL("./fixtures/skill-structure/", import.meta.url));

/** The skills the slimmed core ships. Rule 5 asserts `skills/` holds exactly these. */
export const CORE_SKILLS = [
  "close",
  "code-review",
  "codebase-design",
  "commit",
  "design",
  "diagnosing-bugs",
  "discover",
  "domain-modeling",
  "grill-me",
  "handoff",
  "implement",
  "myflow",
  "onboard",
  "plan",
  "prototype",
  "research",
  "scope",
  "tdd",
  "technical-writing",
  "verify",
];

/** Skills that move under `parked/`. A core skill may not reference one. */
export const PARKED_SKILLS = [
  "architecture-review",
  "capturing-learnings",
  "changelog",
  "epiphany-tabling",
  "improve-codebase-architecture",
  "langfuse",
  "observing-myflow",
  "resolving-merge-conflicts",
  "setup-pre-commit",
  "setup-ts-deep-modules",
  "unslop",
  "wait-what",
  "wayfinder",
  "wizard",
  "writing-retros",
  "writing-skills",
];

/** Names that are merged or renamed away. Kept so rule 3 still catches them once the directory is gone. */
export const RETIRED_SKILLS = ["create-handoff", "grill-with-docs", "grilling", "resume-handoff", "validate"];

/** The Agent Skills frontmatter keys a portable skill may declare. */
export const ALLOWED_FRONTMATTER_KEYS = [
  "argument-hint",
  "compatibility",
  "description",
  "disable-model-invocation",
  "license",
  "metadata",
  "name",
];

/** Syntax that binds a skill to one agent. */
const AGENT_SYNTAX_PATTERNS = [
  { label: "/skill:", pattern: /\/skill:/ },
  { label: "${SKILL_DIR}", pattern: /\$\{SKILL_DIR\}/ },
  { label: "${CLAUDE_", pattern: /\$\{CLAUDE_/ },
  { label: "shell-injection fence", pattern: /^```!/m },
  { label: "ask_user_question", pattern: /ask_user_question/ },
  { label: "subagent(", pattern: /subagent\(/ },
  { label: "@agent-", pattern: /@agent-/ },
  { label: ".pi/", pattern: /\.pi\// },
  { label: "PI_", pattern: /\bPI_/ },
  { label: ".myflow/workstreams", pattern: /\.myflow\/workstreams/ },
];

/**
 * The one documented exception to rule 4: the `myflow` router carries a table of every
 * supported agent's invocation syntax, so a skill's prose never has to. Nothing else may
 * name a host's own syntax, and the exemption is per file and per label.
 */
const AGENT_SYNTAX_EXEMPTIONS = new Map([["skills/myflow/SKILL.md", new Set(["/skill:"])]]);

const RULES = {
  frontmatter: "rule1-frontmatter",
  references: "rule2-references",
  skillReferences: "rule3-skill-references",
  agentSyntax: "rule4-agent-syntax",
  coreSet: "rule5-core-set",
};

const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Directories a skill bundles its own resources in. A reference starting here resolves against the skill. */
const BUNDLE_DIRECTORIES = new Set(["agents", "evals", "examples", "references", "scripts", "templates", "_helpers"]);
/** Leading segments that mark a path as an example from a target repository, not a bundled resource. */
const EXAMPLE_SOURCE_DIRECTORIES = new Set(["app", "apps", "dist", "lib", "node_modules", "packages", "src", "test", "tests"]);
const REFERENCE_EXTENSIONS = new Set([
  ".cjs",
  ".dot",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".py",
  ".sh",
  ".ts",
  ".yaml",
  ".yml",
]);

function toPosix(path) {
  return path.split(sep).join(posix.sep);
}

async function listMarkdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

async function listSkillDirectories(skillsRoot) {
  let entries;
  try {
    entries = await readdir(skillsRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const names = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      await readFile(join(skillsRoot, entry.name, "SKILL.md"));
      names.push(entry.name);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return names.sort();
}

/** Parses the leading `---` block as flat `key: value` pairs. Returns null when the block is absent or unterminated. */
export function parseFrontmatter(document) {
  const lines = document.split("\n");
  if (lines[0]?.trim() !== "---") return null;
  const end = lines.indexOf("---", 1);
  if (end === -1) return null;

  const entries = [];
  for (const line of lines.slice(1, end)) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const match = /^([A-Za-z0-9_-]+):\s?(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    entries.push([match[1], value]);
  }
  return { keys: entries.map(([key]) => key), values: Object.fromEntries(entries) };
}

/** Every inline code span in a Markdown document, fenced blocks excluded. */
function inlineCodeSpans(document) {
  const withoutFences = document.replace(/^```[^\n]*\n[\s\S]*?^```/gm, "");
  return [...withoutFences.matchAll(/`([^`\n]+)`/g)].map((match) => match[1]);
}

/** Whitespace-separated words of every fenced code block, where skills put the commands they run. */
function fencedCodeWords(document) {
  return [...document.matchAll(/^```[^\n]*\n([\s\S]*?)^```/gm)].flatMap((match) => match[1].split(/\s+/));
}

function markdownLinkTargets(document) {
  return [...document.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]);
}

/**
 * Turns one candidate token into a repository-relative path, or null when it is not a
 * skill-bundled resource reference.
 *
 * `bare` allows a reference with no directory separator. Markdown link targets are always
 * paths, so they set it; an inline code span only sets it for an ALL-CAPS Markdown
 * reference file, which no target repository would own.
 */
function resolveReference(token, { skillDirectory, fileDirectory, repositoryRootPath, bare = false }) {
  let candidate = token.trim().replace(/^@/, "");
  candidate = candidate.replace(/^[('"<[]+/, "").replace(/[)'">\],.;:]+$/, "");
  if (candidate === "") return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate) || candidate.startsWith("mailto:")) return null;
  candidate = candidate.split("#")[0];
  if (candidate === "") return null;

  candidate = candidate.replace(/^\$\{SKILL_DIR\}\//, "");
  const placeholder = /^<[^>]+>\/(.*)$/.exec(candidate);
  if (placeholder) {
    candidate = placeholder[1];
    if (!candidate.startsWith("skills/")) return null;
  }
  if (/[<>{}*?$]/.test(candidate)) return null;
  if (EXAMPLE_SOURCE_DIRECTORIES.has(candidate.replace(/^\.\//, "").split("/")[0])) return null;

  const extension = candidate.slice(candidate.lastIndexOf("."));
  if (!REFERENCE_EXTENSIONS.has(extension)) return null;

  let absolute;
  if (candidate.startsWith("skills/")) {
    absolute = resolve(repositoryRootPath, candidate);
  } else if (candidate.startsWith("./") || candidate.startsWith("../")) {
    absolute = resolve(fileDirectory, candidate);
  } else if (BUNDLE_DIRECTORIES.has(candidate.split("/")[0])) {
    absolute = resolve(skillDirectory, candidate);
  } else if (bare && !candidate.includes("/")) {
    absolute = resolve(fileDirectory, candidate);
  } else {
    return null;
  }

  return { relativePath: toPosix(relative(repositoryRootPath, absolute)), absolute };
}

/** ALL-CAPS Markdown files a skill bundles as its own format reference, e.g. `ADR-FORMAT.md`. */
const BUNDLED_REFERENCE_NAME = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*\.md$/;
/** ALL-CAPS Markdown names that belong to a target repository, not to a skill. */
const REPOSITORY_DOCUMENT_NAMES = new Set([
  "AGENTS.md",
  "CHANGELOG.md",
  "CLAUDE.md",
  "CODEOWNERS.md",
  "CONTEXT-MAP.md",
  "CONTEXT.md",
  "CONTRIBUTING.md",
  "LICENSE.md",
  "NOTICE.md",
  "README.md",
  "SECURITY.md",
  "SKILL.md",
  "TODO.md",
]);

function isBundledReferenceName(token) {
  return BUNDLED_REFERENCE_NAME.test(token) && !REPOSITORY_DOCUMENT_NAMES.has(token);
}

/**
 * Checks a MyFlow skill tree against the five structural rules.
 *
 * @param {string} root repository root holding a `skills/` directory
 * @returns {Promise<Array<{rule: string, path: string, detail: string, key: string}>>} sorted, de-duplicated violations
 */
export async function lintSkillTree(root, options = {}) {
  const core = options.core ?? CORE_SKILLS;
  const parked = options.parked ?? PARKED_SKILLS;
  const retired = options.retired ?? RETIRED_SKILLS;
  const repositoryRootPath = resolve(root);
  const skillsRoot = join(repositoryRootPath, "skills");
  const skillNames = await listSkillDirectories(skillsRoot);

  const violations = [];
  const add = (rule, path, detail) => violations.push({ rule, path, detail, key: `${path}: ${detail}` });

  const present = new Set(skillNames);
  const parkedSet = new Set(parked);
  const coreSet = new Set(core);
  const knownSkillNames = new Set([...core, ...parked, ...retired, ...skillNames]);

  for (const name of skillNames) {
    if (!coreSet.has(name)) add(RULES.coreSet, "skills", `unexpected skill: ${name}`);
  }
  for (const name of core) {
    if (!present.has(name)) add(RULES.coreSet, "skills", `missing skill: ${name}`);
  }

  for (const name of skillNames) {
    const skillDirectory = join(skillsRoot, name);
    const skillPath = toPosix(relative(repositoryRootPath, join(skillDirectory, "SKILL.md")));
    const skillDocument = await readFile(join(skillDirectory, "SKILL.md"), "utf8");

    const frontmatter = parseFrontmatter(skillDocument);
    if (!frontmatter) {
      add(RULES.frontmatter, skillPath, "missing or unterminated frontmatter block");
    } else {
      for (const key of frontmatter.keys) {
        if (!ALLOWED_FRONTMATTER_KEYS.includes(key)) add(RULES.frontmatter, skillPath, `disallowed key: ${key}`);
      }
      const declaredName = frontmatter.values.name;
      if (declaredName === undefined) {
        add(RULES.frontmatter, skillPath, "missing key: name");
      } else {
        if (declaredName !== name) add(RULES.frontmatter, skillPath, `name does not match directory: ${declaredName}`);
        if (!SKILL_NAME_PATTERN.test(declaredName)) {
          add(RULES.frontmatter, skillPath, `name is not lowercase-hyphen: ${declaredName}`);
        }
        if (declaredName.length > MAX_NAME_LENGTH) {
          add(RULES.frontmatter, skillPath, `name longer than ${MAX_NAME_LENGTH} characters`);
        }
      }
      const description = frontmatter.values.description;
      if (description === undefined || description === "") {
        add(RULES.frontmatter, skillPath, "missing key: description");
      } else if (description.length > MAX_DESCRIPTION_LENGTH) {
        add(RULES.frontmatter, skillPath, `description longer than ${MAX_DESCRIPTION_LENGTH} characters`);
      }
    }

    for (const file of await listMarkdownFiles(skillDirectory)) {
      const filePath = toPosix(relative(repositoryRootPath, file));
      const document = await readFile(file, "utf8");
      const fileDirectory = dirname(file);

      const spans = inlineCodeSpans(document);

      const exempt = AGENT_SYNTAX_EXEMPTIONS.get(filePath);
      for (const { label, pattern } of AGENT_SYNTAX_PATTERNS) {
        if (exempt?.has(label)) continue;
        if (pattern.test(document)) add(RULES.agentSyntax, filePath, `agent-specific syntax: ${label}`);
      }

      const tokens = [
        ...spans.flatMap((span) => span.split(/\s+/)).map((token) => ({ token, bare: false })),
        ...fencedCodeWords(document).map((token) => ({ token, bare: false })),
        ...markdownLinkTargets(document).map((token) => ({ token, bare: true })),
      ];
      for (const { token, bare } of tokens) {
        const context = { skillDirectory, fileDirectory, repositoryRootPath };
        const reference = resolveReference(token, { ...context, bare: bare || isBundledReferenceName(token) });
        if (!reference) continue;
        try {
          await readFile(reference.absolute);
        } catch (error) {
          if (error.code === "EISDIR") continue;
          add(RULES.references, filePath, `missing reference: ${reference.relativePath}`);
        }
      }

      if (!coreSet.has(name)) continue;
      for (const span of spans) {
        const referenced = span.trim();
        if (referenced === name || !knownSkillNames.has(referenced)) continue;
        if (parkedSet.has(referenced)) {
          add(RULES.skillReferences, filePath, `parked skill referenced: ${referenced}`);
        } else if (!present.has(referenced)) {
          add(RULES.skillReferences, filePath, `unknown skill referenced: ${referenced}`);
        }
      }
    }
  }

  const seen = new Set();
  return violations
    .filter((violation) => {
      const identity = `${violation.rule} ${violation.key}`;
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    })
    .sort((a, b) => a.rule.localeCompare(b.rule) || a.key.localeCompare(b.key));
}

/** Groups violations into the baseline's `{rule: [entry]}` shape. */
export function groupViolations(violations) {
  const grouped = Object.fromEntries(Object.values(RULES).map((rule) => [rule, []]));
  for (const violation of violations) grouped[violation.rule].push(violation.key);
  for (const rule of Object.keys(grouped)) grouped[rule].sort();
  return grouped;
}

test("the skill tree reports exactly the violations recorded in the baseline", async () => {
  const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
  const actual = groupViolations(await lintSkillTree(repositoryRoot));

  assert.deepEqual(
    Object.keys(baseline).sort(),
    Object.keys(actual).sort(),
    "the baseline must carry one array per lint rule",
  );

  const unexpected = [];
  const stale = [];
  for (const rule of Object.keys(actual)) {
    const recorded = new Set(baseline[rule]);
    const found = new Set(actual[rule]);
    for (const entry of actual[rule]) if (!recorded.has(entry)) unexpected.push(`${rule}: ${entry}`);
    for (const entry of baseline[rule]) if (!found.has(entry)) stale.push(`${rule}: ${entry}`);
  }

  assert.deepEqual(unexpected, [], `new structural violations are not allowed:\n${unexpected.join("\n")}`);
  assert.deepEqual(stale, [], `the baseline may only shrink; remove these fixed entries:\n${stale.join("\n")}`);
});

test("the baseline is sorted, de-duplicated, and free of entries the lint cannot produce", async () => {
  const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
  for (const [rule, entries] of Object.entries(baseline)) {
    assert.deepEqual(entries, [...entries].sort(), `${rule} entries must be sorted`);
    assert.equal(new Set(entries).size, entries.length, `${rule} entries must be unique`);
  }
});

test("a clean fixture tree produces no violations", async () => {
  const violations = await lintSkillTree(cleanFixture, {
    core: ["clean-stage", "clean-support"],
    parked: ["parked-example"],
  });

  assert.deepEqual(violations.map((violation) => violation.key), []);
});

test("a violation introduced into a scratch copy of the tree makes the lint fail", async (t) => {
  const scratch = await mkdtemp(join(tmpdir(), "myflow-skill-structure-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  await cp(cleanFixture, scratch, { recursive: true });

  const options = { core: ["clean-stage", "clean-support"], parked: ["parked-example"] };
  const before = await lintSkillTree(scratch, options);
  assert.deepEqual(before, [], "the scratch copy starts clean");

  const stage = join(scratch, "skills", "clean-stage", "SKILL.md");
  const original = await readFile(stage, "utf8");
  await writeFile(
    stage,
    original
      .replace("name: clean-stage", "name: Clean_Stage\nshell-timeout: 120")
      .replace("`templates/stage.md`", "`templates/absent.md`")
      .concat(
        "\n## Introduced violations\n\nRun `/skill:clean-support` and read `${SKILL_DIR}/references/none.md`.",
        "\nDelegate to `parked-example` and write to `.myflow/workstreams/<id>/`.\n",
      ),
  );
  await mkdir(join(scratch, "skills", "stray-skill"));
  await writeFile(
    join(scratch, "skills", "stray-skill", "SKILL.md"),
    "---\nname: stray-skill\ndescription: Use when the lint needs a skill outside the agreed core set.\n---\n\n# Stray\n",
  );

  const after = new Set((await lintSkillTree(scratch, options)).map((violation) => `${violation.rule}: ${violation.key}`));

  for (const expected of [
    "rule1-frontmatter: skills/clean-stage/SKILL.md: disallowed key: shell-timeout",
    "rule1-frontmatter: skills/clean-stage/SKILL.md: name does not match directory: Clean_Stage",
    "rule1-frontmatter: skills/clean-stage/SKILL.md: name is not lowercase-hyphen: Clean_Stage",
    "rule2-references: skills/clean-stage/SKILL.md: missing reference: skills/clean-stage/templates/absent.md",
    "rule2-references: skills/clean-stage/SKILL.md: missing reference: skills/clean-stage/references/none.md",
    "rule3-skill-references: skills/clean-stage/SKILL.md: parked skill referenced: parked-example",
    "rule4-agent-syntax: skills/clean-stage/SKILL.md: agent-specific syntax: /skill:",
    "rule4-agent-syntax: skills/clean-stage/SKILL.md: agent-specific syntax: ${SKILL_DIR}",
    "rule4-agent-syntax: skills/clean-stage/SKILL.md: agent-specific syntax: .myflow/workstreams",
    "rule5-core-set: skills: unexpected skill: stray-skill",
  ]) {
    assert.ok(after.has(expected), `lint must report: ${expected}`);
  }
});

test("a missing core skill and a retired skill reference are reported", async (t) => {
  const scratch = await mkdtemp(join(tmpdir(), "myflow-skill-structure-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  await cp(cleanFixture, scratch, { recursive: true });
  await rm(join(scratch, "skills", "clean-support"), { recursive: true });

  const violations = await lintSkillTree(scratch, {
    core: ["clean-stage", "clean-support"],
    parked: ["parked-example"],
    retired: ["clean-support"],
  });

  const keys = violations.map((violation) => `${violation.rule}: ${violation.key}`);
  assert.ok(keys.includes("rule5-core-set: skills: missing skill: clean-support"));
  assert.ok(keys.includes("rule3-skill-references: skills/clean-stage/SKILL.md: unknown skill referenced: clean-support"));
});
