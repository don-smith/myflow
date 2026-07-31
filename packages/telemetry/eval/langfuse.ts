import type { FrictionFinding } from "./types.js";

/**
 * Publish deterministic evaluator results as Langfuse scores. Scores are
 * attached to the run observation, so they can be filtered, charted, and
 * used by Langfuse evaluation rules/experiments instead of being stranded in
 * local logs. The optional method keeps this helper compatible with older
 * tracing SDKs.
 */
export function scoreFrictionFindings(observation: unknown, findings: FrictionFinding[]): void {
	const score = (observation as { score?: (args: Record<string, unknown>) => void }).score;
	if (typeof score !== "function") return;
	const severityValue = { low: 0.25, medium: 0.5, high: 1 } as const;
	for (const finding of findings) {
		score.call(observation, {
			name: `myflow.friction.${finding.type}`,
			value: severityValue[finding.severity],
			comment: finding.description,
			metadata: finding.evidence,
		});
	}
	// A stable aggregate score is useful for dashboards and CI gates: 1 is a
	// clean run, 0 is a run with at least one actionable finding.
	score.call(observation, {
		name: "myflow.friction-free",
		value: findings.some((finding) => finding.severity !== "low") ? 0 : 1,
		comment: `${findings.length} deterministic friction finding(s)`,
	});
}
