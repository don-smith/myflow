import { type Static, Type } from "typebox";
import { Value } from "typebox/value";

/** The sole wire contract shared by the Pi extension, Pi ACP, and Resonance. */
export const QUESTIONNAIRE_PROTOCOL_KIND = "myflow.dev/questionnaire";
export const BRIDGE_PROTOCOL_VERSION = 1;
export const BRIDGE_INPUT_TITLE = "__myflow_questionnaire_bridge__";
export const BRIDGE_ENVIRONMENT_KEY = "MYFLOW_QUESTIONNAIRE_BRIDGE_VERSION";
export const MAX_BRIDGE_PAYLOAD_BYTES = 64 * 1024;

export const MAX_QUESTIONS = 4;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 4;
export const MAX_HEADER_LENGTH = 16;
export const MAX_LABEL_LENGTH = 60;

/** These labels are protocol data: every renderer must reserve the same words. */
export const SENTINEL_LABELS = {
	other: "Type something.",
	chat: "Chat about this",
	next: "Next",
} as const;
export const RESERVED_LABELS = ["Other", SENTINEL_LABELS.other, SENTINEL_LABELS.chat, SENTINEL_LABELS.next] as const;

export const OptionSchema = Type.Object({
	label: Type.String({
		maxLength: MAX_LABEL_LENGTH,
		description: `MAX ${MAX_LABEL_LENGTH} CHARACTERS — hard limit, requests over the limit are rejected. The display text for this option that the user will see and select. Should be concise (1-5 words) and clearly describe the choice.`,
	}),
	description: Type.String({
		description: "Explanation of what this option means or what will happen if chosen. Useful for providing context about trade-offs or implications.",
	}),
	preview: Type.Optional(Type.String({
		description: "Optional preview content rendered when this option is focused. Use for mockups, code snippets, or visual comparisons that help users compare options. See the tool description for the expected content format.",
	})),
});
export const QuestionSchema = Type.Object({
	question: Type.String({
		description: 'The complete question to ask the user. Should be clear, specific, and end with a question mark. Example: "Which library should we use for date formatting?" If multiSelect is true, phrase it accordingly, e.g. "Which features do you want to enable?"',
	}),
	header: Type.String({
		maxLength: MAX_HEADER_LENGTH,
		description: `MAX ${MAX_HEADER_LENGTH} CHARACTERS — hard limit, requests over the limit are rejected. Very short chip/tag shown next to the question. Examples: "Auth method", "Library", "Approach".`,
	}),
	options: Type.Array(OptionSchema, {
		minItems: MIN_OPTIONS,
		maxItems: MAX_OPTIONS,
		description: "The available choices for this question. Must have 2-4 options. Should be distinct, mutually exclusive choices unless multiSelect is enabled. The 'Type something.' row is appended automatically — do NOT author it.",
	}),
	multiSelect: Type.Optional(Type.Boolean({
		default: false,
		description: "Set to true to allow multiple answers; this suppresses the Type something row.",
	})),
});
export const QuestionsSchema = Type.Array(QuestionSchema, {
	minItems: 1,
	maxItems: MAX_QUESTIONS,
	description: "Questions to ask the user (1-4 questions)",
});
export const QuestionParamsSchema = Type.Object({ questions: QuestionsSchema });

const AnswerBaseSchema = {
	questionIndex: Type.Integer({ minimum: 0 }),
	question: Type.String(),
	notes: Type.Optional(Type.String()),
	preview: Type.Optional(Type.String()),
};
export const QuestionAnswerSchema = Type.Union([
	Type.Object({ ...AnswerBaseSchema, kind: Type.Literal("option"), answer: Type.Union([Type.String(), Type.Null()]) }),
	Type.Object({ ...AnswerBaseSchema, kind: Type.Literal("custom"), answer: Type.Union([Type.String(), Type.Null()]) }),
	Type.Object({ ...AnswerBaseSchema, kind: Type.Literal("chat"), answer: Type.Union([Type.String(), Type.Null()]) }),
	Type.Object({ ...AnswerBaseSchema, kind: Type.Literal("multi"), answer: Type.Null(), selected: Type.Array(Type.String()) }),
]);
export const QuestionnaireErrorSchema = Type.Union([
	Type.Literal("no_ui"),
	Type.Literal("no_questions"),
	Type.Literal("empty_options"),
	Type.Literal("too_many_questions"),
	Type.Literal("duplicate_question"),
	Type.Literal("duplicate_option_label"),
	Type.Literal("reserved_label"),
	Type.Literal("bridge_unavailable"),
	Type.Literal("bridge_protocol_error"),
]);
export const QuestionnaireResultSchema = Type.Object({
	answers: Type.Array(QuestionAnswerSchema),
	cancelled: Type.Boolean(),
	error: Type.Optional(QuestionnaireErrorSchema),
});

export const QuestionnaireRequestEnvelopeSchema = Type.Object({
	kind: Type.Literal(QUESTIONNAIRE_PROTOCOL_KIND),
	version: Type.Literal(BRIDGE_PROTOCOL_VERSION),
	request: QuestionParamsSchema,
});
export const QuestionnaireResultEnvelopeSchema = Type.Object({
	kind: Type.Literal(QUESTIONNAIRE_PROTOCOL_KIND),
	version: Type.Literal(BRIDGE_PROTOCOL_VERSION),
	result: QuestionnaireResultSchema,
});

export type OptionData = Static<typeof OptionSchema>;
export type QuestionData = Static<typeof QuestionSchema>;
export type QuestionParams = Static<typeof QuestionParamsSchema>;
export type QuestionAnswer = Static<typeof QuestionAnswerSchema>;
export type QuestionnaireError = Static<typeof QuestionnaireErrorSchema>;
export type QuestionnaireResult = Static<typeof QuestionnaireResultSchema>;
export type QuestionnaireRequestEnvelope = Static<typeof QuestionnaireRequestEnvelopeSchema>;
export type QuestionnaireResultEnvelope = Static<typeof QuestionnaireResultEnvelopeSchema>;
export type QuestionnaireValidationIssue =
	| "no_questions"
	| "empty_options"
	| "too_many_questions"
	| "duplicate_question"
	| "duplicate_option_label"
	| "reserved_label";
export type BridgeFailureCode = "malformed" | "overflow" | "wrong_kind" | "wrong_version" | "invalid_request" | "invalid_result";

export class BridgeProtocolError extends Error {
	constructor(readonly code: BridgeFailureCode, message: string) {
		super(message);
		this.name = "BridgeProtocolError";
	}
}

function encodedSize(value: string): number {
	return new TextEncoder().encode(value).byteLength;
}

function parseEnvelope(value: string): unknown {
	if (encodedSize(value) > MAX_BRIDGE_PAYLOAD_BYTES) {
		throw new BridgeProtocolError("overflow", `Questionnaire bridge payload exceeds ${MAX_BRIDGE_PAYLOAD_BYTES} bytes.`);
	}
	try {
		return JSON.parse(value) as unknown;
	} catch {
		throw new BridgeProtocolError("malformed", "Questionnaire bridge payload is not valid JSON.");
	}
}

function assertHeader(value: unknown): asserts value is { kind?: unknown; version?: unknown } {
	if (!value || typeof value !== "object") {
		throw new BridgeProtocolError("malformed", "Questionnaire bridge payload must be an object.");
	}
	const header = value as { kind?: unknown; version?: unknown };
	if (header.kind !== QUESTIONNAIRE_PROTOCOL_KIND) {
		throw new BridgeProtocolError("wrong_kind", "Questionnaire bridge payload has an unsupported kind.");
	}
	if (header.version !== BRIDGE_PROTOCOL_VERSION) {
		throw new BridgeProtocolError("wrong_version", "Questionnaire bridge payload has an unsupported version.");
	}
}

/** Semantic request validation that does not import a renderer or UI state. */
export function questionnaireValidationIssue(request: QuestionParams): QuestionnaireValidationIssue | null {
	if (request.questions.length === 0) return "no_questions";
	if (request.questions.length > MAX_QUESTIONS) return "too_many_questions";

	const questions = new Set<string>();
	for (const question of request.questions) {
		if (questions.has(question.question)) return "duplicate_question";
		questions.add(question.question);
	}
	for (const question of request.questions) {
		if (question.options.length < MIN_OPTIONS) return "empty_options";
		const labels = new Set<string>();
		for (const option of question.options) {
			if ((RESERVED_LABELS as readonly string[]).includes(option.label)) return "reserved_label";
			if (labels.has(option.label)) return "duplicate_option_label";
			labels.add(option.label);
		}
	}
	return null;
}

export function isValidQuestionnaireResult(result: QuestionnaireResult, request?: QuestionParams): boolean {
	if (!Value.Check(QuestionnaireResultSchema, result)) return false;
	if (!request) return true;

	const answered = new Set<number>();
	for (const answer of result.answers) {
		if (answered.has(answer.questionIndex)) return false;
		answered.add(answer.questionIndex);
		const question = request.questions[answer.questionIndex];
		if (!question || answer.question !== question.question) return false;
		if (answer.kind === "option") {
			const option = question.options.find(({ label }) => label === answer.answer);
			if (!option || (answer.preview !== undefined && answer.preview !== option.preview)) return false;
		}
		if (answer.kind === "chat" && answer.answer !== SENTINEL_LABELS.chat) return false;
		if (answer.kind === "multi") {
			if (!question.multiSelect || new Set(answer.selected).size !== answer.selected.length) return false;
			if (answer.selected.some(selected => !question.options.some(option => option.label === selected))) return false;
		}
	}
	return true;
}

function encode(envelope: unknown): string {
	const value = JSON.stringify(envelope);
	if (encodedSize(value) > MAX_BRIDGE_PAYLOAD_BYTES) {
		throw new BridgeProtocolError("overflow", `Questionnaire bridge payload exceeds ${MAX_BRIDGE_PAYLOAD_BYTES} bytes.`);
	}
	return value;
}

export function encodeQuestionnaireRequest(request: QuestionParams): string {
	if (!Value.Check(QuestionParamsSchema, request) || questionnaireValidationIssue(request)) {
		throw new BridgeProtocolError("invalid_request", "Questionnaire request does not satisfy the bridge protocol.");
	}
	return encode({ kind: QUESTIONNAIRE_PROTOCOL_KIND, version: BRIDGE_PROTOCOL_VERSION, request });
}

export function decodeQuestionnaireRequest(value: string): QuestionParams {
	const envelope = parseEnvelope(value);
	assertHeader(envelope);
	if (!Value.Check(QuestionnaireRequestEnvelopeSchema, envelope) || questionnaireValidationIssue(envelope.request)) {
		throw new BridgeProtocolError("invalid_request", "Questionnaire request does not satisfy the bridge protocol.");
	}
	return envelope.request;
}

export function encodeQuestionnaireResult(result: QuestionnaireResult, request?: QuestionParams): string {
	if (!isValidQuestionnaireResult(result, request)) {
		throw new BridgeProtocolError("invalid_result", "Questionnaire result does not satisfy the bridge protocol.");
	}
	return encode({ kind: QUESTIONNAIRE_PROTOCOL_KIND, version: BRIDGE_PROTOCOL_VERSION, result });
}

export function decodeQuestionnaireResult(value: string, request?: QuestionParams): QuestionnaireResult {
	const envelope = parseEnvelope(value);
	assertHeader(envelope);
	if (!Value.Check(QuestionnaireResultEnvelopeSchema, envelope) || !isValidQuestionnaireResult(envelope.result, request)) {
		throw new BridgeProtocolError("invalid_result", "Questionnaire result does not satisfy the bridge protocol.");
	}
	return envelope.result;
}

export function isBridgeAvailable(environment: Record<string, string | undefined> = process.env): boolean {
	return environment[BRIDGE_ENVIRONMENT_KEY] === String(BRIDGE_PROTOCOL_VERSION);
}
