import { afterEach, describe, expect, it, vi } from "vitest";
import { registerAskUserQuestionTool } from "./ask-user-question.js";
import { BRIDGE_INPUT_TITLE, encodeQuestionnaireResult } from "./protocol.js";

const params = {
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

function registeredTool() {
	let tool: any;
	registerAskUserQuestionTool({
		registerTool(next: unknown) { tool = next; },
		events: { emit() {} },
	} as never);
	return tool;
}

const originalVersion = process.env.MYFLOW_QUESTIONNAIRE_BRIDGE_VERSION;
afterEach(() => {
	if (originalVersion === undefined) delete process.env.MYFLOW_QUESTIONNAIRE_BRIDGE_VERSION;
	else process.env.MYFLOW_QUESTIONNAIRE_BRIDGE_VERSION = originalVersion;
});

describe("ask_user_question bridge route", () => {
	it("sends exactly one reserved input carrier and preserves the canonical response envelope", async () => {
		process.env.MYFLOW_QUESTIONNAIRE_BRIDGE_VERSION = "1";
		const input = vi.fn(async () => encodeQuestionnaireResult({
			cancelled: false,
			answers: [{ questionIndex: 0, question: "Which?", kind: "option", answer: "A" }],
		}));
		const custom = vi.fn();
		const response = await registeredTool().execute("call", params, undefined, undefined, {
			hasUI: true,
			mode: "rpc",
			ui: { input, custom },
		});

		expect(input).toHaveBeenCalledOnce();
		expect(input).toHaveBeenCalledWith(BRIDGE_INPUT_TITLE, expect.any(String));
		expect(custom).not.toHaveBeenCalled();
		expect(response.content[0].text).toContain('"Which?"="A"');
	});

	it("returns visible failures rather than falling back to a primitive dialog", async () => {
		process.env.MYFLOW_QUESTIONNAIRE_BRIDGE_VERSION = "1";
		const custom = vi.fn();
		const malformed = await registeredTool().execute("call", params, undefined, undefined, {
			hasUI: true,
			mode: "rpc",
			ui: { input: async () => "not json", custom },
		});
		expect(malformed.details).toMatchObject({ cancelled: true, error: "bridge_protocol_error" });
		expect(custom).not.toHaveBeenCalled();

		delete process.env.MYFLOW_QUESTIONNAIRE_BRIDGE_VERSION;
		const unavailable = await registeredTool().execute("call", params, undefined, undefined, {
			hasUI: true,
			mode: "rpc",
			ui: { custom },
		});
		expect(unavailable.details).toMatchObject({ cancelled: true, error: "bridge_unavailable" });
		expect(custom).not.toHaveBeenCalled();
	});
});
