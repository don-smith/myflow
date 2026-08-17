import { describe, expect, it } from "vitest";
import {
	BRIDGE_INPUT_TITLE,
	BRIDGE_PROTOCOL_VERSION,
	BridgeProtocolError,
	decodeQuestionnaireRequest,
	decodeQuestionnaireResult,
	encodeQuestionnaireRequest,
	encodeQuestionnaireResult,
	isBridgeAvailable,
} from "./protocol.js";

const request = {
	questions: [
		{
			question: "Which?",
			header: "Pick",
			options: [
				{ label: "A", description: "First" },
				{ label: "B", description: "Second" },
			],
		},
	],
};

const result = {
	cancelled: false,
	answers: [{ questionIndex: 0, question: "Which?", kind: "option" as const, answer: "A" }],
};

describe("questionnaire bridge protocol", () => {
	it("round-trips versioned request and result envelopes", () => {
		const encodedRequest = encodeQuestionnaireRequest(request);
		const encodedResult = encodeQuestionnaireResult(result);

		expect(BRIDGE_INPUT_TITLE).not.toContain("Which?");
		expect(decodeQuestionnaireRequest(encodedRequest)).toEqual(request);
		expect(decodeQuestionnaireResult(encodedResult)).toEqual(result);
	});

	it("rejects malformed, wrong kind, wrong version, and oversized envelopes", () => {
		for (const value of [
			"not json",
			JSON.stringify({ kind: "wrong", version: BRIDGE_PROTOCOL_VERSION, request }),
			JSON.stringify({ kind: "myflow.dev/questionnaire", version: 999, request }),
			"x".repeat(65 * 1024),
		]) {
			expect(() => decodeQuestionnaireRequest(value)).toThrow(BridgeProtocolError);
		}
	});

	it("rejects a result that does not match the submitted questionnaire", () => {
		const encoded = JSON.stringify({
			kind: "myflow.dev/questionnaire-result",
			version: BRIDGE_PROTOCOL_VERSION,
			result: { ...result, answers: [{ ...result.answers[0], answer: "not an option" }] },
		});
		expect(() => decodeQuestionnaireResult(encoded, request)).toThrow(BridgeProtocolError);
	});

	it("requires the exact negotiated bridge environment", () => {
		expect(isBridgeAvailable({ MYFLOW_QUESTIONNAIRE_BRIDGE_VERSION: "1" })).toBe(true);
		expect(isBridgeAvailable({ MYFLOW_QUESTIONNAIRE_BRIDGE_VERSION: "2" })).toBe(false);
		expect(isBridgeAvailable({})).toBe(false);
	});
});
