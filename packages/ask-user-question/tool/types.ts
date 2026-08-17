import { type QuestionnaireResult } from "../protocol.js";

/**
 * TUI-facing compatibility exports. Questionnaire DTOs now live in the
 * dependency-light public protocol module so non-TUI bridge consumers never
 * import the render graph.
 */
export {
	MAX_QUESTIONS,
	MIN_OPTIONS,
	MAX_OPTIONS,
	MAX_HEADER_LENGTH,
	MAX_LABEL_LENGTH,
	SENTINEL_LABELS,
	RESERVED_LABELS,
	OptionSchema,
	QuestionSchema,
	QuestionsSchema,
	QuestionParamsSchema,
	type OptionData,
	type QuestionData,
	type QuestionParams,
	type QuestionAnswer,
	type QuestionnaireError,
	type QuestionnaireResult,
} from "../protocol.js";

export type SentinelKind = "other" | "chat" | "next";
export type SentinelLabel = (typeof import("../protocol.js").SENTINEL_LABELS)[SentinelKind];
export type ReservedLabel = (typeof import("../protocol.js").RESERVED_LABELS)[number];
/** Legacy TUI guard: detailed cross-process validation belongs to protocol.ts. */
export function isQuestionnaireResult(value: unknown): value is QuestionnaireResult {
	if (!value || typeof value !== "object") return false;
	const record = value as Record<string, unknown>;
	return Array.isArray(record.answers) && typeof record.cancelled === "boolean";
}
