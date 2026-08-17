import { MAX_QUESTIONS, MIN_OPTIONS, questionnaireValidationIssue, RESERVED_LABELS } from "../protocol.js";
import type { QuestionnaireError, QuestionParams } from "./types.js";

export const ERROR_NO_QUESTIONS = "Error: At least one question is required";
export const ERROR_TOO_MANY_QUESTIONS = `Error: At most ${MAX_QUESTIONS} questions are allowed per invocation`;
export const ERROR_DUPLICATE_QUESTION = "Error: Question text must be unique within an invocation";
export const ERROR_TOO_FEW_OPTIONS = `Error: Each question requires at least ${MIN_OPTIONS} options`;
export const ERROR_RESERVED_LABEL = `Error: Option label is reserved (${RESERVED_LABELS.join(", ")})`;
export const ERROR_DUPLICATE_OPTION_LABEL = "Error: Option labels must be unique within a question";

export type ValidationResult = { ok: true } | { ok: false; error: QuestionnaireError; message: string };

const ERROR_BY_ISSUE = {
	no_questions: ERROR_NO_QUESTIONS,
	too_many_questions: ERROR_TOO_MANY_QUESTIONS,
	duplicate_question: ERROR_DUPLICATE_QUESTION,
	empty_options: ERROR_TOO_FEW_OPTIONS,
	reserved_label: ERROR_RESERVED_LABEL,
	duplicate_option_label: ERROR_DUPLICATE_OPTION_LABEL,
} as const;

/**
 * Pure runtime validator for `QuestionParams`. Covers every guard except
 * `no_ui` (which depends on `ctx.hasUI` and stays inline at the call site).
 * `reserved_label` MUST short-circuit before `duplicate_option_label`.
 */
export function validateQuestionnaire(typed: QuestionParams): ValidationResult {
	const issue = questionnaireValidationIssue(typed);
	return issue ? { ok: false, error: issue, message: ERROR_BY_ISSUE[issue] } : { ok: true };
}
