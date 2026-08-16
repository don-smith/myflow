import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

const ANALYSIS_VERSION = "work-analysis-v1";
const DEFAULT_PAGE_LIMIT = 1_000;
const CONTEXT_SWITCH_WINDOW_MS = 60 * 60 * 1_000;

export type WorkType =
	| "bug"
	| "feature"
	| "refactor"
	| "test"
	| "documentation"
	| "research"
	| "planning"
	| "review"
	| "operations"
	| "other";

export interface WorkFlowSignals {
	wallClockMinutes: number;
	turnCount: number;
	toolCallCount: number;
	toolErrorCount: number;
	toolSuccessRate: number | null;
	correctionLanguage: boolean;
	contextSwitch: boolean;
	previousRepository?: string;
}

export interface WorkItem {
	traceId: string;
	observationId: string;
	sessionId?: string;
	startedAt: string;
	endedAt?: string;
	repository: string;
	branch?: string;
	workType: WorkType;
	synopsis: string[];
	promptCaptured: boolean;
	promptSource: "langfuse" | "local-pi-session" | "missing";
	flowSignals: WorkFlowSignals;
}

export interface WorkReport {
	analysisVersion: typeof ANALYSIS_VERSION;
	from: string;
	to: string;
	generatedAt: string;
	items: WorkItem[];
	summary: {
		traceCount: number;
		workItemCount: number;
		promptCapturedCount: number;
		langfusePromptCount: number;
		localPromptRecoveredCount: number;
		missingPromptCount: number;
		contextSwitchCount: number;
		repositories: Record<string, number>;
		workTypes: Record<WorkType, number>;
	};
}

export interface LangfuseWorkReportOptions {
	baseUrl: string;
	publicKey: string;
	secretKey: string;
	from: string | Date;
	to?: string | Date;
	repository?: string;
	/** Explicit opt-in fallback for traces created before prompt capture was enabled. */
	localPiSessions?: string;
	fetchFn?: typeof fetch;
	pageLimit?: number;
	maxPages?: number;
}

export interface PublishWorkReportOptions {
	baseUrl: string;
	publicKey: string;
	secretKey: string;
	fetchFn?: typeof fetch;
	environment?: string;
}

interface LangfuseObservation {
	id: string;
	traceId: string;
	startTime: string;
	endTime?: string | null;
	parentObservationId?: string | null;
	type: string;
	name?: string | null;
	level?: string | null;
	statusMessage?: string | null;
	sessionId?: string | null;
	isRootObservation?: boolean;
	input?: unknown;
	output?: unknown;
	metadata?: Record<string, unknown> | null;
}

interface ObservationPage {
	data: LangfuseObservation[];
	meta?: { cursor?: string | null };
}

function iso(value: string | Date): string {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${String(value)}`);
	return date.toISOString();
}

function authorization(publicKey: string, secretKey: string): string {
	if (!publicKey.trim() || !secretKey.trim()) throw new Error("Langfuse public and secret keys are required.");
	return `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString("base64")}`;
}

function normalizedBaseUrl(baseUrl: string): string {
	const normalized = baseUrl.trim().replace(/\/$/, "");
	if (!normalized) throw new Error("Langfuse base URL is required.");
	return normalized;
}

function parseIo(value: unknown): unknown {
	if (typeof value !== "string") return value;
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

function textContent(value: unknown): string | undefined {
	if (typeof value === "string") return value.trim() || undefined;
	if (Array.isArray(value)) {
		const text = value
			.map((entry) => {
				if (typeof entry === "string") return entry;
				if (!entry || typeof entry !== "object") return "";
				const block = entry as Record<string, unknown>;
				return typeof block.text === "string" ? block.text : typeof block.content === "string" ? block.content : "";
			})
			.filter(Boolean)
			.join("\n")
			.trim();
		return text || undefined;
	}
	if (value && typeof value === "object") {
		const record = value as Record<string, unknown>;
		return textContent(record.text ?? record.content);
	}
	return undefined;
}

function promptFromInput(input: unknown): string | undefined {
	const parsed = parseIo(input);
	if (typeof parsed === "string") return parsed.trim() || undefined;
	if (Array.isArray(parsed)) {
		for (const message of [...parsed].reverse()) {
			if (!message || typeof message !== "object") continue;
			const record = message as Record<string, unknown>;
			if (record.role === "user") return textContent(record.content);
		}
		return undefined;
	}
	if (!parsed || typeof parsed !== "object") return undefined;
	const record = parsed as Record<string, unknown>;
	if (typeof record.prompt === "string") return record.prompt.trim() || undefined;
	if (Array.isArray(record.messages)) return promptFromInput(record.messages);
	if (Array.isArray(record.input)) return promptFromInput(record.input);
	return undefined;
}

function compactLine(value: string, max = 220): string {
	const compact = value
		.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, "")
		.replace(/\s+/g, " ")
		.trim();
	return compact.length <= max ? compact : `${compact.slice(0, max - 1).trimEnd()}…`;
}

function synopsisFromPrompt(prompt: string | undefined): string[] {
	if (!prompt) return [];
	const blocks = prompt
		.split(/\n{2,}|\n(?=\s*(?:[-*+]\s+|\d+[.)]\s+))/)
		.map((block) => compactLine(block))
		.filter(Boolean);
	if (blocks.length > 1) return blocks.slice(0, 5);
	const sentences = prompt
		.replace(/\s+/g, " ")
		.split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
		.map((sentence) => compactLine(sentence))
		.filter(Boolean);
	return (sentences.length > 0 ? sentences : [compactLine(prompt)]).slice(0, 3);
}

const workTypePatterns: ReadonlyArray<[WorkType, RegExp]> = [
	["bug", /\b(?:bug|broken|error|fail(?:ing|ure)?|fix|debug|diagnos|regression|not working|still (?:fails?|broken))\b/i],
	["test", /\b(?:test|spec|coverage|assertion|fixture|vitest|jest)\b/i],
	["refactor", /\b(?:refactor|restructure|simplif|cleanup|clean up|extract|rename|debt)\b/i],
	["review", /\b(?:review|audit|critique|inspect changes|pull request|\bpr\b)\b/i],
	["documentation", /\b(?:document|documentation|readme|docs|runbook|explainer|changelog)\b/i],
	["research", /\b(?:research|investigate|explore|find out|compare|understand|spike|prototype)\b/i],
	["planning", /\b(?:plan|design|architecture|scope|roadmap|brief|proposal)\b/i],
	["operations", /\b(?:deploy|release|ci|pipeline|docker|infrastructure|migration|configure|setup|install)\b/i],
	["feature", /\b(?:feature|implement|build|create|add|support|introduce|allow|enable)\b/i],
];

function classifyWork(prompt: string | undefined): WorkType {
	if (!prompt) return "other";
	return workTypePatterns.find(([, pattern]) => pattern.test(prompt))?.[0] ?? "other";
}

function metadataString(observation: LangfuseObservation, key: string): string | undefined {
	const value = observation.metadata?.[key];
	return typeof value === "string" && value.trim() ? value : undefined;
}

function isUserRoot(observation: LangfuseObservation): boolean {
	if (observation.name !== "agent-run" || observation.type !== "AGENT") return false;
	return !metadataString(observation, "parentSessionId") && !metadataString(observation, "agentType");
}

function rounded(value: number, places = 3): number {
	return Number(value.toFixed(places));
}

async function readObservations(options: LangfuseWorkReportOptions, from: string, to: string): Promise<LangfuseObservation[]> {
	const fetchFn = options.fetchFn ?? fetch;
	const baseUrl = normalizedBaseUrl(options.baseUrl);
	const auth = authorization(options.publicKey, options.secretKey);
	const limit = options.pageLimit ?? DEFAULT_PAGE_LIMIT;
	const maxPages = options.maxPages ?? 100;
	if (!Number.isInteger(limit) || limit < 1 || limit > DEFAULT_PAGE_LIMIT) throw new Error("pageLimit must be between 1 and 1000.");
	if (!Number.isInteger(maxPages) || maxPages < 1) throw new Error("maxPages must be a positive integer.");

	const observations: LangfuseObservation[] = [];
	let cursor: string | undefined;
	for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
		const url = new URL(`${baseUrl}/api/public/v2/observations`);
		url.searchParams.set("fromStartTime", from);
		url.searchParams.set("toStartTime", to);
		url.searchParams.set("fields", "core,basic,time,io,metadata,metrics,trace_context");
		url.searchParams.set("limit", String(limit));
		if (cursor) url.searchParams.set("cursor", cursor);
		const response = await fetchFn(url, { headers: { authorization: auth } });
		if (!response.ok) throw new Error(`Langfuse observations request failed with status ${response.status}.`);
		const body = (await response.json()) as ObservationPage;
		if (!Array.isArray(body.data)) throw new Error("Langfuse observations response did not contain a data array.");
		observations.push(...body.data);
		cursor = body.meta?.cursor || undefined;
		if (!cursor) return observations;
	}
	throw new Error(`Langfuse observations exceeded the configured ${maxPages}-page safety limit.`);
}

function buildWorkItems(observations: LangfuseObservation[], repositoryFilter?: string): WorkItem[] {
	const byTrace = new Map<string, LangfuseObservation[]>();
	for (const observation of observations) {
		const trace = byTrace.get(observation.traceId) ?? [];
		trace.push(observation);
		byTrace.set(observation.traceId, trace);
	}

	const items: WorkItem[] = [];
	for (const [traceId, trace] of byTrace) {
		const root = trace.filter(isUserRoot).sort((left, right) => left.startTime.localeCompare(right.startTime))[0];
		if (!root) continue;
		const repository = metadataString(root, "repository") ?? "unknown";
		if (repositoryFilter && repository !== repositoryFilter) continue;
		const prompt = promptFromInput(root.input);
		const tools = trace.filter((observation) => observation.type === "TOOL");
		const toolErrors = tools.filter((observation) => observation.level === "ERROR" || Boolean(observation.statusMessage));
		const turns = trace.filter((observation) => observation.name === "agent-turn");
		const startedAt = new Date(root.startTime);
		const endedAt = root.endTime ? new Date(root.endTime) : undefined;
		const wallClockMinutes = endedAt && !Number.isNaN(endedAt.getTime())
			? rounded(Math.max(0, endedAt.getTime() - startedAt.getTime()) / 60_000)
			: 0;
		items.push({
			traceId,
			observationId: root.id,
			...(root.sessionId ? { sessionId: root.sessionId } : {}),
			startedAt: root.startTime,
			...(root.endTime ? { endedAt: root.endTime } : {}),
			repository,
			...(metadataString(root, "branch") ? { branch: metadataString(root, "branch") } : {}),
			workType: classifyWork(prompt),
			synopsis: synopsisFromPrompt(prompt),
			promptCaptured: Boolean(prompt),
			promptSource: prompt ? "langfuse" : "missing",
			flowSignals: {
				wallClockMinutes,
				turnCount: turns.length,
				toolCallCount: tools.length,
				toolErrorCount: toolErrors.length,
				toolSuccessRate: tools.length > 0 ? rounded((tools.length - toolErrors.length) / tools.length) : null,
				correctionLanguage: Boolean(prompt && /\b(?:actually|instead|still|again|not what|didn['’]t|doesn['’]t|you missed|try again)\b/i.test(prompt)),
				contextSwitch: false,
			},
		});
	}

	// Older extension versions could export the same logical root through more
	// than one active provider instance. Collapse exact run duplicates while
	// retaining the copy with the richest evidence.
	const deduplicated = new Map<string, WorkItem>();
	const evidence = (candidate: WorkItem): number =>
		(candidate.promptCaptured ? 10_000 : 0) + candidate.flowSignals.turnCount + candidate.flowSignals.toolCallCount;
	for (const item of items) {
		const key = [item.sessionId ?? "", item.startedAt, item.endedAt ?? "", item.repository].join("|");
		const existing = deduplicated.get(key);
		if (!existing || evidence(item) > evidence(existing) || (evidence(item) === evidence(existing) && item.traceId < existing.traceId)) {
			deduplicated.set(key, item);
		}
	}
	const clustersBySession = new Map<string, Array<{ end: number; best: WorkItem }>>();
	const ungrouped: WorkItem[] = [];
	for (const item of [...deduplicated.values()].sort((left, right) => left.startedAt.localeCompare(right.startedAt))) {
		if (!item.sessionId || !item.endedAt) {
			ungrouped.push(item);
			continue;
		}
		const key = `${item.sessionId}|${item.repository}`;
		const clusters = clustersBySession.get(key) ?? [];
		const start = new Date(item.startedAt).getTime();
		const end = new Date(item.endedAt).getTime();
		const active = clusters.at(-1);
		if (active && start <= active.end) {
			active.end = Math.max(active.end, end);
			if (evidence(item) > evidence(active.best) || (evidence(item) === evidence(active.best) && item.traceId < active.best.traceId)) active.best = item;
		} else clusters.push({ end, best: item });
		clustersBySession.set(key, clusters);
	}
	const workItems = [
		...ungrouped,
		...[...clustersBySession.values()].flatMap((clusters) => clusters.map((cluster) => cluster.best)),
	];
	workItems.sort((left, right) => left.startedAt.localeCompare(right.startedAt));
	for (let index = 1; index < workItems.length; index++) {
		const previous = workItems[index - 1];
		const current = workItems[index];
		const previousEnd = new Date(previous.endedAt ?? previous.startedAt).getTime();
		const gap = new Date(current.startedAt).getTime() - previousEnd;
		if (previous.repository !== current.repository && gap >= 0 && gap <= CONTEXT_SWITCH_WINDOW_MS) {
			current.flowSignals.contextSwitch = true;
			current.flowSignals.previousRepository = previous.repository;
		}
	}
	return workItems;
}

async function listSessionFiles(root: string): Promise<string[]> {
	const files: string[] = [];
	const walk = async (directory: string): Promise<void> => {
		let entries;
		try {
			entries = await readdir(directory, { withFileTypes: true });
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`Local Pi session directory does not exist: ${root}`);
			throw error;
		}
		for (const entry of entries) {
			const entryPath = join(directory, entry.name);
			if (entry.isDirectory()) await walk(entryPath);
			else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(entryPath);
		}
	};
	await walk(root);
	return files;
}

interface LocalPrompt {
	timestamp: number;
	prompt: string;
}

async function recoverLocalPrompts(items: WorkItem[], sessionRoot: string): Promise<void> {
	const missingSessionIds = new Set(items.filter((item) => !item.promptCaptured).map((item) => item.sessionId).filter((value): value is string => Boolean(value)));
	if (missingSessionIds.size === 0) return;
	const promptsBySession = new Map<string, LocalPrompt[]>();
	for (const file of await listSessionFiles(sessionRoot)) {
		const sessionId = [...missingSessionIds].find((candidate) => basename(file).includes(candidate));
		if (!sessionId) continue;
		const prompts: LocalPrompt[] = [];
		for (const line of (await readFile(file, "utf8")).split("\n")) {
			if (!line.trim()) continue;
			let entry: Record<string, unknown>;
			try {
				entry = JSON.parse(line) as Record<string, unknown>;
			} catch {
				continue;
			}
			const message = entry.message;
			if (!message || typeof message !== "object" || (message as Record<string, unknown>).role !== "user") continue;
			const prompt = textContent((message as Record<string, unknown>).content);
			const timestamp = typeof entry.timestamp === "string" ? new Date(entry.timestamp).getTime() : Number.NaN;
			if (prompt && !Number.isNaN(timestamp)) prompts.push({ timestamp, prompt });
		}
		promptsBySession.set(sessionId, [...(promptsBySession.get(sessionId) ?? []), ...prompts]);
	}

	for (const item of items) {
		if (item.promptCaptured || !item.sessionId) continue;
		const startedAt = new Date(item.startedAt).getTime();
		const candidate = (promptsBySession.get(item.sessionId) ?? [])
			.map((prompt) => ({ ...prompt, distance: Math.abs(prompt.timestamp - startedAt) }))
			.filter((prompt) => prompt.distance <= 30_000)
			.sort((left, right) => left.distance - right.distance)[0];
		if (!candidate) continue;
		item.synopsis = synopsisFromPrompt(candidate.prompt);
		item.workType = classifyWork(candidate.prompt);
		item.promptCaptured = true;
		item.promptSource = "local-pi-session";
		item.flowSignals.correctionLanguage = /\b(?:actually|instead|still|again|not what|didn['’]t|doesn['’]t|you missed|try again)\b/i.test(candidate.prompt);
	}
}

function emptyWorkTypeCounts(): Record<WorkType, number> {
	return { bug: 0, feature: 0, refactor: 0, test: 0, documentation: 0, research: 0, planning: 0, review: 0, operations: 0, other: 0 };
}

/**
 * Read Langfuse v4 observations and reduce them to user-facing coding work.
 * Pagination, tolerant I/O parsing, trace reconstruction, sub-agent exclusion,
 * classification, and flow-signal calculation stay behind this interface.
 */
export async function createLangfuseWorkReport(options: LangfuseWorkReportOptions): Promise<WorkReport> {
	const from = iso(options.from);
	const to = iso(options.to ?? new Date());
	if (from >= to) throw new Error("Work report start must be before its end.");
	const observations = await readObservations(options, from, to);
	const items = buildWorkItems(observations, options.repository);
	if (options.localPiSessions) await recoverLocalPrompts(items, options.localPiSessions);
	const repositories: Record<string, number> = {};
	const workTypes = emptyWorkTypeCounts();
	for (const item of items) {
		repositories[item.repository] = (repositories[item.repository] ?? 0) + 1;
		workTypes[item.workType]++;
	}
	const promptCapturedCount = items.filter((item) => item.promptCaptured).length;
	const langfusePromptCount = items.filter((item) => item.promptSource === "langfuse").length;
	const localPromptRecoveredCount = items.filter((item) => item.promptSource === "local-pi-session").length;
	return {
		analysisVersion: ANALYSIS_VERSION,
		from,
		to,
		generatedAt: new Date().toISOString(),
		items,
		summary: {
			traceCount: new Set(observations.map((observation) => observation.traceId)).size,
			workItemCount: items.length,
			promptCapturedCount,
			langfusePromptCount,
			localPromptRecoveredCount,
			missingPromptCount: items.length - promptCapturedCount,
			contextSwitchCount: items.filter((item) => item.flowSignals.contextSwitch).length,
			repositories,
			workTypes,
		},
	};
}

function scoreId(traceId: string, name: string): string {
	return createHash("sha256").update(`${ANALYSIS_VERSION}:${traceId}:${name}`).digest("hex").slice(0, 32);
}

function scorePayloads(item: WorkItem, environment?: string): Array<Record<string, unknown>> {
	const metadata = { analysisVersion: ANALYSIS_VERSION, evidence: item.flowSignals };
	const common = { traceId: item.traceId, observationId: item.observationId, ...(environment ? { environment } : {}) };
	const scores: Array<Record<string, unknown>> = [
		{ ...common, id: scoreId(item.traceId, "myflow.work.type"), name: "myflow.work.type", value: item.workType, dataType: "CATEGORICAL", metadata },
		{ ...common, id: scoreId(item.traceId, "myflow.flow.wall-clock-minutes"), name: "myflow.flow.wall-clock-minutes", value: item.flowSignals.wallClockMinutes, dataType: "NUMERIC", metadata },
		{ ...common, id: scoreId(item.traceId, "myflow.flow.turn-count"), name: "myflow.flow.turn-count", value: item.flowSignals.turnCount, dataType: "NUMERIC", metadata },
		{ ...common, id: scoreId(item.traceId, "myflow.flow.context-switch"), name: "myflow.flow.context-switch", value: item.flowSignals.contextSwitch ? 1 : 0, dataType: "BOOLEAN", metadata },
	];
	if (item.flowSignals.toolSuccessRate !== null) {
		scores.push({ ...common, id: scoreId(item.traceId, "myflow.flow.tool-success-rate"), name: "myflow.flow.tool-success-rate", value: item.flowSignals.toolSuccessRate, dataType: "NUMERIC", metadata });
	}
	if (item.synopsis.length > 0) {
		const synopsis = item.synopsis.join(" • ").slice(0, 500);
		scores.push({ ...common, id: scoreId(item.traceId, "myflow.work.synopsis"), name: "myflow.work.synopsis", value: synopsis, dataType: "TEXT", metadata });
	}
	return scores;
}

/** Publish derived values as idempotent Langfuse scores. This is never called by report generation. */
export async function publishWorkReportScores(report: WorkReport, options: PublishWorkReportOptions): Promise<{ published: number }> {
	const fetchFn = options.fetchFn ?? fetch;
	const baseUrl = normalizedBaseUrl(options.baseUrl);
	const auth = authorization(options.publicKey, options.secretKey);
	let published = 0;
	for (const item of report.items) {
		for (const body of scorePayloads(item, options.environment)) {
			const response = await fetchFn(`${baseUrl}/api/public/scores`, {
				method: "POST",
				headers: { authorization: auth, "content-type": "application/json" },
				body: JSON.stringify(body),
			});
			if (!response.ok) throw new Error(`Langfuse score publication failed with status ${response.status}.`);
			published++;
		}
	}
	return { published };
}

export function formatWorkReport(report: WorkReport): string {
	const lines = [
		"# Agent work report",
		"",
		`Range: ${report.from} to ${report.to}`,
		`Analysis: ${report.analysisVersion}`,
		"",
		`Work items: ${report.summary.workItemCount} · Langfuse prompts: ${report.summary.langfusePromptCount} · locally recovered: ${report.summary.localPromptRecoveredCount} · missing prompts: ${report.summary.missingPromptCount} · context-switch signals: ${report.summary.contextSwitchCount}`,
		"",
		"> Flow values are deterministic signals, not a claim about subjective flow. Calibrate them against human ratings before combining them into a flow score.",
		"",
	];
	const byRepository = new Map<string, WorkItem[]>();
	for (const item of [...report.items].reverse()) {
		const items = byRepository.get(item.repository) ?? [];
		items.push(item);
		byRepository.set(item.repository, items);
	}
	for (const [repository, items] of byRepository) {
		lines.push(`## ${repository}`, "");
		for (const item of items) {
			const flow = item.flowSignals;
			const flags = [flow.contextSwitch ? `switch from ${flow.previousRepository}` : "", flow.correctionLanguage ? "correction language" : ""].filter(Boolean);
			lines.push(`### ${item.startedAt} · ${item.workType}`, "");
			lines.push(`${flow.wallClockMinutes} wall-clock min · ${flow.turnCount} turns · ${flow.toolCallCount} tools · ${flow.toolErrorCount} tool errors${flags.length ? ` · ${flags.join(" · ")}` : ""}`, "");
			if (item.synopsis.length === 0) lines.push("- Request content was not captured. Enable `llmPayload: \"prompts\"` for future traces.");
			else for (const bullet of item.synopsis) lines.push(`- ${bullet}`);
			lines.push("");
		}
	}
	return `${lines.join("\n").trim()}\n`;
}
