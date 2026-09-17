import type { LangfuseClient } from "@langfuse/client";
import type { FrictionFinding } from "./types.js";

interface ScoreTarget {
	readonly id: string;
	readonly traceId: string;
}

/**
 * Publish deterministic evaluator results as Langfuse scores. Scores are
 * attached to the root run observation, so they can be filtered, charted, and
 * used by Langfuse evaluation rules/experiments instead of being stranded in
 * local logs.
 */
export function scoreFrictionFindings(
	client: Pick<LangfuseClient, "score">,
	observation: ScoreTarget,
	findings: FrictionFinding[],
	environment?: string,
): void {
	const severityValue = { low: 0.25, medium: 0.5, high: 1 } as const;
	for (const [index, finding] of findings.entries()) {
		const name = `myflow.friction.${finding.type}`;
		client.score.create({
			id: `${observation.traceId}-${name}-${index}`,
			traceId: observation.traceId,
			observationId: observation.id,
			name,
			value: severityValue[finding.severity],
			...(environment ? { environment } : {}),
			dataType: "NUMERIC",
			comment: finding.description,
			metadata: finding.evidence,
		});
	}
	// A stable aggregate score is useful for dashboards and CI gates: 1 is a
	// clean run, 0 is a run with at least one actionable finding.
	const name = "myflow.friction-free";
	client.score.create({
		id: `${observation.traceId}-${name}`,
		traceId: observation.traceId,
		observationId: observation.id,
		name,
		value: findings.some((finding) => finding.severity !== "low") ? 0 : 1,
		...(environment ? { environment } : {}),
		dataType: "NUMERIC",
		comment: `${findings.length} deterministic friction finding(s)`,
	});
}
