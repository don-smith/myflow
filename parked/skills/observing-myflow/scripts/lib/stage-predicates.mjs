import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ACTIVITY_BY_STAGE, CANONICAL_STAGES } from "../../../../../skills/myflow/scripts/lib/lifecycle-contract.mjs";

function noop() {
  return [];
}

function parseFrontmatter(text) {
  if (!text.startsWith("---\n")) return { frontmatter: {}, body: text };
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) return { frontmatter: {}, body: text };
  const fmText = text.slice(4, end);
  const body = text.slice(end + 5);
  const frontmatter = {};
  for (const line of fmText.split("\n")) {
    const colon = line.indexOf(":");
    if (colon !== -1) {
      const key = line.slice(0, colon).trim();
      const value = line.slice(colon + 1).trim();
      frontmatter[key] = value;
    }
  }
  return { frontmatter, body };
}

function sectionExists(text, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^#{1,4}\\s+${escaped}`, "im");
  return pattern.test(text);
}

function headingContent(text, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^#{1,4}\\s+${escaped}\\s*$(\\n[^#].*)*`, "im");
  const match = text.match(pattern);
  return match ? match[0].trim() : "";
}

async function readAcceptedArtifacts(artifacts, repositoryRoot) {
  const contents = {};
  for (const { artifactRef } of artifacts) {
    try {
      const fullPath = join(repositoryRoot, artifactRef.path);
      contents[artifactRef.path] = await readFile(fullPath, "utf8");
    } catch {
      contents[artifactRef.path] = null;
    }
  }
  return contents;
}

function predicateResult(value, evidence) {
  return { result: value ? "pass" : "fail", evidence: evidence || [] };
}

function unknownResult(reason) {
  return { result: "unknown", evidence: [reason] };
}

function notApplicableResult() {
  return { result: "not-applicable", evidence: [] };
}

export async function scopePredicates({
  lifecycleState,
  artifacts,
  feedback,
  repositoryRoot,
}) {
  const stageArtifacts = artifacts.filter((a) => a.canonicalStage === "Scope");
  const files = await readAcceptedArtifacts(stageArtifacts, repositoryRoot);
  const allText = Object.values(files).filter(Boolean).join("\n");

  if (!allText) {
    return [
      { id: "scope.artifact-accepted", ...unknownResult("no accepted Scope artifact found") },
      { id: "scope.frontmatter-valid", ...unknownResult("no artifact to parse") },
      { id: "scope.outcome-defined", ...unknownResult("no artifact to check") },
      { id: "scope.beneficiary-defined", ...unknownResult("no artifact to check") },
      { id: "scope.non-goals-defined", ...unknownResult("no artifact to check") },
      { id: "scope.acceptance-criteria", ...unknownResult("no artifact to check") },
      { id: "scope.risk-assessed", ...unknownResult("no artifact to check") },
      { id: "scope.depth-specified", ...unknownResult("no artifact to check") },
      { id: "scope.open-questions-owned", ...unknownResult("no artifact to check") },
      { id: "scope.next-action-selected", ...unknownResult("no artifact to check") },
      { id: "scope.developer-acceptance", ...developerAcceptancePredicate("Scope", lifecycleState, feedback) },
    ];
  }

  const firstFile = Object.values(files).find(Boolean);
  const { frontmatter, body } = parseFrontmatter(firstFile);
  const validFm = frontmatter.kind && frontmatter.workstream && frontmatter.status;

  return [
    {
      id: "scope.artifact-accepted",
      ...predicateResult(stageArtifacts.length > 0, [
        `${stageArtifacts.length} artifact(s) accepted`,
      ]),
    },
    {
      id: "scope.frontmatter-valid",
      ...predicateResult(!!validFm, [
        validFm
          ? `kind=${frontmatter.kind}, workstream=${frontmatter.workstream}, status=${frontmatter.status}`
          : "frontmatter missing required fields (kind, workstream, status)",
      ]),
    },
    {
      id: "scope.outcome-defined",
      ...predicateResult(sectionExists(body, "Outcome"), [
        sectionExists(body, "Outcome") ? "Outcome section found" : "Outcome section not found",
      ]),
    },
    {
      id: "scope.beneficiary-defined",
      ...predicateResult(
        sectionExists(body, "Beneficiary") || sectionExists(body, "Beneficiaries"),
        [
          sectionExists(body, "Beneficiary") || sectionExists(body, "Beneficiaries")
            ? "Beneficiary section found"
            : "Beneficiary section not found",
        ],
      ),
    },
    {
      id: "scope.non-goals-defined",
      ...predicateResult(
        sectionExists(body, "Non-goals") || sectionExists(body, "Non goals"),
        [
          sectionExists(body, "Non-goals") || sectionExists(body, "Non goals")
            ? "Non-goals section found"
            : "Non-goals section not found",
        ],
      ),
    },
    {
      id: "scope.acceptance-criteria",
      ...predicateResult(
        sectionExists(body, "Acceptance") ||
          sectionExists(body, "Acceptance criteria") ||
          sectionExists(body, "Acceptance Criteria"),
        [
          sectionExists(body, "Acceptance") ||
          sectionExists(body, "Acceptance criteria") ||
          sectionExists(body, "Acceptance Criteria")
            ? "Acceptance criteria section found"
            : "Acceptance criteria section not found",
        ],
      ),
    },
    {
      id: "scope.risk-assessed",
      ...predicateResult(sectionExists(body, "Risk"), [
        sectionExists(body, "Risk") ? "Risk section found" : "Risk section not found",
      ]),
    },
    {
      id: "scope.depth-specified",
      ...predicateResult(
        sectionExists(body, "Depth") || frontmatter.depth !== undefined,
        [
          sectionExists(body, "Depth") || frontmatter.depth !== undefined
            ? "Depth specified"
            : "Depth not specified",
        ],
      ),
    },
    {
      id: "scope.open-questions-owned",
      ...predicateResult(
        sectionExists(body, "Open questions") ||
          sectionExists(body, "Open Questions") ||
          sectionExists(body, "Blockers"),
        [
          sectionExists(body, "Open questions") ||
          sectionExists(body, "Open Questions") ||
          sectionExists(body, "Blockers")
            ? "Open questions section found"
            : "Open questions section not found",
        ],
      ),
    },
    {
      id: "scope.next-action-selected",
      ...predicateResult(
        sectionExists(body, "Next action") || sectionExists(body, "Next steps"),
        [
          sectionExists(body, "Next action") || sectionExists(body, "Next steps")
            ? "Next action section found"
            : "Next action section not found",
        ],
      ),
    },
    {
      id: "scope.developer-acceptance",
      ...developerAcceptancePredicate("Scope", lifecycleState, feedback),
    },
  ];
}

export async function planPredicates({
  lifecycleState,
  artifacts,
  feedback,
  repositoryRoot,
}) {
  const stageArtifacts = artifacts.filter((a) => a.canonicalStage === "Plan");
  const files = await readAcceptedArtifacts(stageArtifacts, repositoryRoot);
  const allText = Object.values(files).filter(Boolean).join("\n");

  if (!allText) {
    return [
      { id: "plan.artifact-accepted", ...unknownResult("no accepted Plan artifact found") },
      { id: "plan.frontmatter-valid", ...unknownResult("no artifact to parse") },
      { id: "plan.design-disposition", ...unknownResult("no artifact to check") },
      { id: "plan.settled-choices", ...unknownResult("no artifact to check") },
      { id: "plan.executable-phases", ...unknownResult("no artifact to check") },
      { id: "plan.verification-map", ...unknownResult("no artifact to check") },
      { id: "plan.manual-checks", ...unknownResult("no artifact to check") },
      { id: "plan.commit-boundaries", ...unknownResult("no artifact to check") },
      { id: "plan.developer-acceptance", ...developerAcceptancePredicate("Plan", lifecycleState, feedback) },
    ];
  }

  const firstFile = Object.values(files).find(Boolean);
  const { frontmatter, body } = parseFrontmatter(firstFile);
  const validFm = frontmatter.kind && frontmatter.status;

  return [
    {
      id: "plan.artifact-accepted",
      ...predicateResult(stageArtifacts.length > 0, [
        `${stageArtifacts.length} artifact(s) accepted`,
      ]),
    },
    {
      id: "plan.frontmatter-valid",
      ...predicateResult(!!validFm, [
        validFm
          ? `kind=${frontmatter.kind}, status=${frontmatter.status}`
          : "frontmatter missing required fields",
      ]),
    },
    {
      id: "plan.design-disposition",
      ...predicateResult(
        sectionExists(body, "Design disposition") || sectionExists(body, "Design"),
        [
          sectionExists(body, "Design disposition") || sectionExists(body, "Design")
            ? "Design disposition found"
            : "Design disposition not found",
        ],
      ),
    },
    {
      id: "plan.settled-choices",
      ...predicateResult(
        sectionExists(body, "Settled") ||
          sectionExists(body, "Implementation choices") ||
          sectionExists(body, "Decisions"),
        [
          sectionExists(body, "Settled") ||
          sectionExists(body, "Implementation choices") ||
          sectionExists(body, "Decisions")
            ? "Settled choices found"
            : "Settled choices not found",
        ],
      ),
    },
    {
      id: "plan.executable-phases",
      ...predicateResult(
        sectionExists(body, "Implementation phases") || sectionExists(body, "Phases"),
        [
          sectionExists(body, "Implementation phases") || sectionExists(body, "Phases")
            ? "Phases section found"
            : "Phases section not found",
        ],
      ),
    },
    {
      id: "plan.verification-map",
      ...predicateResult(
        sectionExists(body, "Verification map") ||
          sectionExists(body, "Verification") ||
          frontmatter.verification_map !== undefined,
        [
          sectionExists(body, "Verification map") ||
          sectionExists(body, "Verification") ||
          frontmatter.verification_map !== undefined
            ? "Verification map found"
            : "Verification map not found",
        ],
      ),
    },
    {
      id: "plan.manual-checks",
      ...predicateResult(
        /manual[ -]?(verification|check)/i.test(body) ||
          sectionExists(body, "Manual verification"),
        [
          /manual[ -]?(verification|check)/i.test(body) ||
          sectionExists(body, "Manual verification")
            ? "Manual checks referenced"
            : "Manual checks not found",
        ],
      ),
    },
    {
      id: "plan.commit-boundaries",
      ...predicateResult(
        sectionExists(body, "Commit boundary") ||
          sectionExists(body, "Commit boundaries") ||
          sectionExists(body, "Commit and delivery"),
        [
          sectionExists(body, "Commit boundary") ||
          sectionExists(body, "Commit boundaries") ||
          sectionExists(body, "Commit and delivery")
            ? "Commit boundaries found"
            : "Commit boundaries not found",
        ],
      ),
    },
    {
      id: "plan.developer-acceptance",
      ...developerAcceptancePredicate("Plan", lifecycleState, feedback),
    },
  ];
}

export async function implementPredicates({
  lifecycleState,
  artifacts,
  feedback,
  repositoryRoot,
}) {
  const stageArtifacts = artifacts.filter((a) => a.canonicalStage === "Implement");
  const files = await readAcceptedArtifacts(stageArtifacts, repositoryRoot);
  const allText = Object.values(files).filter(Boolean).join("\n");

  if (!allText) {
    return [
      { id: "implement.artifact-accepted", ...unknownResult("no accepted Implement artifact found") },
      { id: "implement.completed-phases", ...unknownResult("no artifact to check") },
      { id: "implement.required-checks", ...unknownResult("no artifact to check") },
      { id: "implement.phase-commits", ...unknownResult("no artifact to check") },
      { id: "implement.deviations", ...unknownResult("no artifact to check") },
      { id: "implement.checkpoint", ...unknownResult("no artifact to check") },
      { id: "implement.outstanding-manual", ...unknownResult("no artifact to check") },
      { id: "implement.verify-readiness", ...unknownResult("no artifact to check") },
    ];
  }

  const firstFile = Object.values(files).find(Boolean);
  const { frontmatter, body } = parseFrontmatter(firstFile);
  const hasCheckpointSection =
    sectionExists(body, "Phase state") || sectionExists(body, "Phase result");
  const hasCommits = /commit[^]*?`[a-f0-9]{7,}`/is.test(body);
  const hasDeviations =
    sectionExists(body, "Deviations") || /deviation/i.test(body);

  return [
    {
      id: "implement.artifact-accepted",
      ...predicateResult(stageArtifacts.length > 0, [
        `${stageArtifacts.length} artifact(s) accepted`,
      ]),
    },
    {
      id: "implement.completed-phases",
      ...predicateResult(
        sectionExists(body, "Phase state") || sectionExists(body, "Completed"),
        [
          sectionExists(body, "Phase state") || sectionExists(body, "Completed")
            ? "Phase state found"
            : "Phase state not found",
        ],
      ),
    },
    {
      id: "implement.required-checks",
      ...predicateResult(/pass(ed|ing)|0 failure/i.test(body), [
        /pass(ed|ing)|0 failure/i.test(body)
          ? "Passing checks referenced"
          : "No passing checks found",
      ]),
    },
    {
      id: "implement.phase-commits",
      ...predicateResult(hasCommits, [
        hasCommits
          ? "Phase commits found"
          : "Phase commits not found",
      ]),
    },
    {
      id: "implement.deviations",
      ...predicateResult(
        hasDeviations || body.includes("no deviations"),
        [
          hasDeviations || body.includes("no deviations")
            ? "Deviations addressed"
            : "Deviations not addressed",
        ],
      ),
    },
    {
      id: "implement.checkpoint",
      ...predicateResult(hasCheckpointSection, [
        hasCheckpointSection
          ? "Implementation checkpoint found"
          : "Implementation checkpoint not found",
      ]),
    },
    {
      id: "implement.outstanding-manual",
      ...predicateResult(
        /outstanding[^.]*manual/i.test(body) ||
          /manual[^.]*verification[^.]*none/is.test(body) ||
          /manual[^.]*check[^.]*none/is.test(body),
        [
          /outstanding[^.]*manual/i.test(body)
            ? "Outstanding manual checks addressed"
            : "Outstanding manual checks not explicitly addressed",
        ],
      ),
    },
    {
      id: "implement.verify-readiness",
      ...predicateResult(
        sectionExists(body, "Next action") ||
          sectionExists(body, "Verify readiness") ||
          /next[^.\n]*(?:phase|action)[^.\n]*Verify/i.test(body),
        [
          sectionExists(body, "Next action") ||
          sectionExists(body, "Verify readiness")
            ? "Next action / Verify readiness found"
            : "Verify readiness not found",
        ],
      ),
    },
  ];
}

export async function verifyPredicates({
  lifecycleState,
  artifacts,
  feedback,
  repositoryRoot,
}) {
  const stageArtifacts = artifacts.filter((a) => a.canonicalStage === "Verify");
  const files = await readAcceptedArtifacts(stageArtifacts, repositoryRoot);
  const allText = Object.values(files).filter(Boolean).join("\n");

  if (!allText) {
    return [
      { id: "verify.artifact-accepted", ...unknownResult("no accepted Verify artifact found") },
      { id: "verify.criterion-coverage", ...unknownResult("no artifact to check") },
      { id: "verify.automated-evidence", ...unknownResult("no artifact to check") },
      { id: "verify.independent-review", ...unknownResult("no artifact to check") },
      { id: "verify.deviations", ...unknownResult("no artifact to check") },
      { id: "verify.manual-brief", ...unknownResult("no artifact to check") },
      { id: "verify.verdict", ...unknownResult("no artifact to check") },
      { id: "verify.next-action", ...unknownResult("no artifact to check") },
    ];
  }

  const firstFile = Object.values(files).find(Boolean);
  const { frontmatter, body } = parseFrontmatter(firstFile);

  return [
    {
      id: "verify.artifact-accepted",
      ...predicateResult(stageArtifacts.length > 0, [
        `${stageArtifacts.length} artifact(s) accepted`,
      ]),
    },
    {
      id: "verify.criterion-coverage",
      ...predicateResult(
        /criterion|acceptance[^.\n]*criteria|acceptance[^.\n]*criterion/i.test(body),
        [
          /criterion|acceptance[^.\n]*criteria|acceptance[^.\n]*criterion/i.test(body)
            ? "Criterion coverage found"
            : "Criterion coverage not found",
        ],
      ),
    },
    {
      id: "verify.automated-evidence",
      ...predicateResult(
        sectionExists(body, "Automated") ||
          /(?:test|check)[^.\n]*(?:pass|green|suite)/i.test(body) ||
          /node --test/i.test(body),
        [
          sectionExists(body, "Automated") ||
          /(?:test|check)[^.\n]*(?:pass|green|suite)/i.test(body)
            ? "Automated evidence found"
            : "Automated evidence not found",
        ],
      ),
    },
    {
      id: "verify.independent-review",
      ...predicateResult(
        /independent[^.\n]*review|review[^.\n]*independent/i.test(body) ||
          sectionExists(body, "Independent review"),
        [
          /independent[^.\n]*review/i.test(body)
            ? "Independent review found"
            : "Independent review not found",
        ],
      ),
    },
    {
      id: "verify.deviations",
      ...predicateResult(
        sectionExists(body, "Deviations") ||
          /deviation/i.test(body) ||
          body.includes("no deviations"),
        [
          sectionExists(body, "Deviations") || /deviation/i.test(body)
            ? "Deviations addressed"
            : "Deviations not explicitly addressed",
        ],
      ),
    },
    {
      id: "verify.manual-brief",
      ...predicateResult(
        sectionExists(body, "Manual") ||
          /manual[^.\n]*(?:verification|check|evidence)/i.test(body),
        [
          sectionExists(body, "Manual")
            ? "Manual brief found"
            : "Manual brief not found",
        ],
      ),
    },
    {
      id: "verify.verdict",
      ...predicateResult(
        sectionExists(body, "Verdict") ||
          frontmatter.verdict !== undefined ||
          /verdict[:\s]+(?:pass|fail|partial)/i.test(body),
        [
          sectionExists(body, "Verdict") || frontmatter.verdict !== undefined
            ? "Verdict found"
            : "Verdict not found",
        ],
      ),
    },
    {
      id: "verify.next-action",
      ...predicateResult(
        sectionExists(body, "Next action") ||
          sectionExists(body, "Next steps") ||
          sectionExists(body, "Recommendation"),
        [
          sectionExists(body, "Next action")
            ? "Next action found"
            : "Next action not found",
        ],
      ),
    },
  ];
}

export async function closePredicates({
  lifecycleState,
  artifacts,
  feedback,
  repositoryRoot,
}) {
  const stageArtifacts = artifacts.filter((a) => a.canonicalStage === "Close");
  const files = await readAcceptedArtifacts(stageArtifacts, repositoryRoot);
  const allText = Object.values(files).filter(Boolean).join("\n");

  if (!allText) {
    return [
      { id: "close.artifact-accepted", ...unknownResult("no accepted Close artifact found") },
      { id: "close.verify-precondition", ...unknownResult("no artifact to check") },
      { id: "close.delivery-decision", ...unknownResult("no artifact to check") },
      { id: "close.documentation-dispositions", ...unknownResult("no artifact to check") },
      { id: "close.final-commit-state", ...unknownResult("no artifact to check") },
      { id: "close.follow-up-ownership", ...unknownResult("no artifact to check") },
      { id: "close.no-unowned-remainder", ...unknownResult("no artifact to check") },
    ];
  }

  const firstFile = Object.values(files).find(Boolean);
  const { frontmatter, body } = parseFrontmatter(firstFile);

  return [
    {
      id: "close.artifact-accepted",
      ...predicateResult(stageArtifacts.length > 0, [
        `${stageArtifacts.length} artifact(s) accepted`,
      ]),
    },
    {
      id: "close.verify-precondition",
      ...predicateResult(
        /verify[^.\n]*(?:pass|complete|green)/i.test(body) ||
          /verification[^.\n]*(?:pass|complete)/i.test(body),
        [
          /verify[^.\n]*(?:pass|complete|green)/i.test(body)
            ? "Verify precondition found"
            : "Verify precondition not found",
        ],
      ),
    },
    {
      id: "close.delivery-decision",
      ...predicateResult(
        sectionExists(body, "Delivery") ||
          sectionExists(body, "Decision") ||
          /deliver/i.test(body),
        [
          sectionExists(body, "Delivery") || sectionExists(body, "Decision")
            ? "Delivery decision found"
            : "Delivery decision not found",
        ],
      ),
    },
    {
      id: "close.documentation-dispositions",
      ...predicateResult(
        sectionExists(body, "Documentation") ||
          sectionExists(body, "Learning") ||
          /document|learn/i.test(body),
        [
          sectionExists(body, "Documentation") || sectionExists(body, "Learning")
            ? "Documentation/learning dispositions found"
            : "Documentation/learning dispositions not found",
        ],
      ),
    },
    {
      id: "close.final-commit-state",
      ...predicateResult(
        /commit[^.\n]*`[a-f0-9]{7,}`/i.test(body) ||
          sectionExists(body, "Git state"),
        [
          /commit[^.\n]*`[a-f0-9]{7,}`/i.test(body)
            ? "Final commit state found"
            : "Final commit state not found",
        ],
      ),
    },
    {
      id: "close.follow-up-ownership",
      ...predicateResult(
        /follow[^.\n]*up|next[^.\n]*owner/i.test(body) ||
          sectionExists(body, "Follow-up"),
        [
          /follow[^.\n]*up/i.test(body)
            ? "Follow-up ownership found"
            : "Follow-up ownership not found",
        ],
      ),
    },
    {
      id: "close.no-unowned-remainder",
      ...predicateResult(
        /unowned|remainder|outstanding/i.test(body) ||
          body.includes("no unowned") ||
          sectionExists(body, "Remaining"),
        [
          /unowned|remainder|outstanding/i.test(body)
            ? "Unowned remainder addressed"
            : "Unowned remainder not explicitly addressed",
        ],
      ),
    },
  ];
}

function developerAcceptancePredicate(stage, lifecycleState, feedback) {
  const hasFeedback = feedback && (feedback.status === "recorded" || feedback.status === "skipped");
  if (!lifecycleState) {
    return unknownResult("lifecycle state not available for acceptance check");
  }
  if (!hasFeedback) {
    return {
      result: "fail",
      evidence: [
        `Developer feedback not recorded for ${stage}: ` +
          `status=${feedback?.status || "missing"}. ` +
          `${stage} requires recorded developer acceptance for satisfied outcome.`,
      ],
    };
  }
  return {
    result: "pass",
    evidence: [
      `Developer feedback recorded: status=${feedback.status}`,
    ],
  };
}

export const PREDICATE_SETS = Object.freeze({
  Scope: scopePredicates,
  Plan: planPredicates,
  Implement: implementPredicates,
  Verify: verifyPredicates,
  Close: closePredicates,
});