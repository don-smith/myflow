#!/usr/bin/env bun
import { createLangfuseWorkReport, formatWorkReport, publishWorkReportScores } from "./work-analysis.js";

interface CliOptions {
	from: string;
	to: string;
	repository?: string;
	localPiSessions?: string;
	json: boolean;
	publish: boolean;
}

function usage(): string {
	return `Usage: bun work-report.ts [options]

Options:
  --from <ISO timestamp>   Start of range (default: seven days ago)
  --to <ISO timestamp>     End of range (default: now)
  --repository <identity>  Exact repository identity from root metadata
  --local-pi-sessions <dir>  Explicitly recover missing prompts from local Pi JSONL files
  --json                   Emit normalized JSON instead of Markdown
  --publish                Publish idempotent derived scores to Langfuse
  --help                   Show this help

Credentials:
  LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, and optionally LANGFUSE_BASE_URL
`;
}

function parseArgs(args: string[]): CliOptions {
	const now = new Date();
	const options: CliOptions = {
		from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1_000).toISOString(),
		to: now.toISOString(),
		json: false,
		publish: false,
	};
	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (arg === "--help") {
			console.log(usage());
			process.exit(0);
		}
		if (arg === "--json") options.json = true;
		else if (arg === "--publish") options.publish = true;
		else if (arg === "--from" || arg === "--to" || arg === "--repository" || arg === "--local-pi-sessions") {
			const value = args[++index];
			if (!value) throw new Error(`${arg} requires a value.`);
			if (arg === "--from") options.from = value;
			else if (arg === "--to") options.to = value;
			else if (arg === "--repository") options.repository = value;
			else options.localPiSessions = value;
		} else throw new Error(`Unknown option: ${arg}`);
	}
	return options;
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	const publicKey = process.env.LANGFUSE_PUBLIC_KEY ?? "";
	const secretKey = process.env.LANGFUSE_SECRET_KEY ?? "";
	const baseUrl = process.env.LANGFUSE_BASE_URL ?? "http://127.0.0.1:13000";
	const report = await createLangfuseWorkReport({
		baseUrl,
		publicKey,
		secretKey,
		from: options.from,
		to: options.to,
		...(options.repository ? { repository: options.repository } : {}),
		...(options.localPiSessions ? { localPiSessions: options.localPiSessions } : {}),
	});
	console.log(options.json ? JSON.stringify(report, null, 2) : formatWorkReport(report));
	if (options.publish) {
		const result = await publishWorkReportScores(report, { baseUrl, publicKey, secretKey });
		console.error(`Published ${result.published} idempotent Langfuse scores.`);
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	console.error(`\n${usage()}`);
	process.exitCode = 1;
});
