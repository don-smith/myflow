import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createLangfuseWorkReport, formatWorkReport, publishWorkReportScores } from "./work-analysis.js";

const credentials = { baseUrl: "http://langfuse.test", publicKey: "pk-test", secretKey: "sk-test" };

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("createLangfuseWorkReport", () => {
	it("paginates v4 observations and reconstructs user work with deterministic flow signals", async () => {
		const fetchFn = vi.fn(async (input: string | URL | Request) => {
			const url = new URL(String(input));
			if (!url.searchParams.has("cursor")) {
				return jsonResponse({
					data: [
						{
							id: "root-1",
							traceId: "trace-1",
							startTime: "2026-08-08T09:00:00.000Z",
							endTime: "2026-08-08T09:12:00.000Z",
							type: "AGENT",
							name: "agent-run",
							sessionId: "session-1",
							input: JSON.stringify({ prompt: "The tests are still failing. Fix the parser bug.\n\n- Add a regression test." }),
							metadata: { repository: "github.com/acme/parser", branch: "main" },
						},
						{
							id: "duplicate-root-1",
							traceId: "duplicate-trace-1",
							startTime: "2026-08-08T09:00:00.000Z",
							endTime: "2026-08-08T09:12:00.000Z",
							type: "AGENT",
							name: "agent-run",
							sessionId: "session-1",
							input: { prompt: "The tests are still failing. Fix the parser bug." },
							metadata: { repository: "github.com/acme/parser", branch: "main" },
						},
						{
							id: "overlapping-root-1",
							traceId: "overlapping-trace-1",
							startTime: "2026-08-08T09:02:00.000Z",
							endTime: "2026-08-08T09:10:00.000Z",
							type: "AGENT",
							name: "agent-run",
							sessionId: "session-1",
							input: { prompt: "Duplicate exporter started late" },
							metadata: { repository: "github.com/acme/parser", branch: "main" },
						},
						{
							id: "tool-1",
							traceId: "trace-1",
							startTime: "2026-08-08T09:02:00.000Z",
							type: "TOOL",
							name: "bash",
							level: "ERROR",
						},
					],
					meta: { cursor: "next-page" },
				});
			}
			return jsonResponse({
				data: [
					{ id: "turn-1", traceId: "trace-1", startTime: "2026-08-08T09:01:00.000Z", type: "CHAIN", name: "agent-turn" },
					{ id: "tool-2", traceId: "trace-1", startTime: "2026-08-08T09:03:00.000Z", type: "TOOL", name: "read" },
					{
						id: "subagent-root",
						traceId: "trace-subagent",
						startTime: "2026-08-08T09:05:00.000Z",
						type: "AGENT",
						name: "agent-run",
						input: { prompt: "Internal delegated task" },
						metadata: { repository: "github.com/acme/parser", agentType: "researcher" },
					},
					{
						id: "root-2",
						traceId: "trace-2",
						startTime: "2026-08-08T09:20:00.000Z",
						endTime: "2026-08-08T09:25:00.000Z",
						type: "AGENT",
						name: "agent-run",
						sessionId: "session-2",
						input: { prompt: "Design and implement a new dashboard feature." },
						metadata: { repository: "github.com/acme/dashboard", branch: "feature/dashboard" },
					},
				],
				meta: {},
			});
		});

		const report = await createLangfuseWorkReport({
			...credentials,
			from: "2026-08-08T00:00:00.000Z",
			to: "2026-08-09T00:00:00.000Z",
			fetchFn: fetchFn as typeof fetch,
		});

		expect(fetchFn).toHaveBeenCalledTimes(2);
		expect(new URL(String(fetchFn.mock.calls[1][0])).searchParams.get("cursor")).toBe("next-page");
		expect(report.summary).toMatchObject({
			traceCount: 5,
			workItemCount: 2,
			promptCapturedCount: 2,
			missingPromptCount: 0,
			contextSwitchCount: 1,
		});
		expect(report.items[0]).toMatchObject({
			traceId: "trace-1",
			workType: "bug",
			synopsis: ["The tests are still failing. Fix the parser bug.", "Add a regression test."],
			flowSignals: {
				wallClockMinutes: 12,
				turnCount: 1,
				toolCallCount: 2,
				toolErrorCount: 1,
				toolSuccessRate: 0.5,
				correctionLanguage: true,
				contextSwitch: false,
			},
		});
		expect(report.items[1]).toMatchObject({
			traceId: "trace-2",
			workType: "planning",
			flowSignals: { contextSwitch: true, previousRepository: "github.com/acme/parser" },
		});
	});

	it("recovers historical prompts from local Pi sessions only when explicitly requested", async () => {
		const sessionId = "019fd78c-f1f8-74cd-b691-b639080dd183";
		const directory = await mkdtemp(join(tmpdir(), "myflow-work-report-"));
		await writeFile(
			join(directory, `2026-08-08_session_${sessionId}.jsonl`),
			`${JSON.stringify({ type: "session", timestamp: "2026-08-08T08:59:00.000Z" })}\n${JSON.stringify({ type: "message", timestamp: "2026-08-08T09:00:00.004Z", message: { role: "user", content: [{ type: "text", text: "Research the parser design" }] } })}\n`,
		);
		const fetchFn = vi.fn(async () => jsonResponse({
			data: [{
				id: "root-1",
				traceId: "trace-1",
				startTime: "2026-08-08T09:00:00.000Z",
				type: "AGENT",
				name: "agent-run",
				sessionId,
				input: { sessionId },
				metadata: { repository: "github.com/acme/parser" },
			}],
			meta: {},
		}));

		try {
			const report = await createLangfuseWorkReport({
				...credentials,
				from: "2026-08-08T00:00:00.000Z",
				to: "2026-08-09T00:00:00.000Z",
				localPiSessions: directory,
				fetchFn: fetchFn as typeof fetch,
			});

			expect(report.items[0]).toMatchObject({
				promptCaptured: true,
				promptSource: "local-pi-session",
				workType: "research",
				synopsis: ["Research the parser design"],
			});
			expect(report.summary).toMatchObject({ localPromptRecoveredCount: 1, missingPromptCount: 0 });
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("reports missing semantic input honestly instead of inventing a synopsis", async () => {
		const fetchFn = vi.fn(async () => jsonResponse({
			data: [{
				id: "root-1",
				traceId: "trace-1",
				startTime: "2026-08-08T09:00:00.000Z",
				type: "AGENT",
				name: "agent-run",
				input: { sessionId: "session-1" },
				metadata: { repository: "github.com/acme/parser" },
			}],
			meta: {},
		}));

		const report = await createLangfuseWorkReport({
			...credentials,
			from: "2026-08-08T00:00:00.000Z",
			to: "2026-08-09T00:00:00.000Z",
			fetchFn: fetchFn as typeof fetch,
		});

		expect(report.items[0]).toMatchObject({ promptCaptured: false, synopsis: [], workType: "other" });
		expect(formatWorkReport(report)).toContain('Enable `llmPayload: "prompts"`');
	});
});

describe("publishWorkReportScores", () => {
	it("publishes only when called and uses stable score IDs on reruns", async () => {
		const readFetch = vi.fn(async () => jsonResponse({
			data: [{
				id: "root-1",
				traceId: "trace-1",
				startTime: "2026-08-08T09:00:00.000Z",
				endTime: "2026-08-08T09:05:00.000Z",
				type: "AGENT",
				name: "agent-run",
				input: { prompt: "Fix the bug" },
				metadata: { repository: "github.com/acme/parser" },
			}, {
				id: "tool-1",
				traceId: "trace-1",
				startTime: "2026-08-08T09:01:00.000Z",
				type: "TOOL",
				name: "read",
			}],
			meta: {},
		}));
		const report = await createLangfuseWorkReport({
			...credentials,
			from: "2026-08-08T00:00:00.000Z",
			to: "2026-08-09T00:00:00.000Z",
			fetchFn: readFetch as typeof fetch,
		});
		const bodies: Array<Record<string, unknown>> = [];
		const publishFetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
			bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
			return jsonResponse({ id: "score" });
		});

		const first = await publishWorkReportScores(report, { ...credentials, fetchFn: publishFetch as typeof fetch });
		const firstIds = bodies.map((body) => body.id);
		const second = await publishWorkReportScores(report, { ...credentials, fetchFn: publishFetch as typeof fetch });
		const secondIds = bodies.slice(firstIds.length).map((body) => body.id);

		expect(first.published).toBe(6);
		expect(second.published).toBe(6);
		expect(firstIds).toEqual(secondIds);
		expect(bodies.find((body) => body.name === "myflow.work.synopsis")).toMatchObject({ dataType: "TEXT", value: "Fix the bug" });
		expect(bodies.find((body) => body.name === "myflow.flow.context-switch")).toMatchObject({ dataType: "BOOLEAN", value: 0 });
	});
});
