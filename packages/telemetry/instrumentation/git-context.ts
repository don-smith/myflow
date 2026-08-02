import { createHash } from "node:crypto";
import { basename } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TelemetrySessionContext } from "../types/events.js";

const GIT_TIMEOUT_MS = 5_000;
export type TelemetryGitContext = TelemetrySessionContext;

function localRepositoryIdentity(root: string): string {
	const name =
		basename(root)
			.toLowerCase()
			.replace(/[^a-z0-9._-]+/g, "-")
			.replace(/^-+|-+$/g, "") || "repo";
	const hash = createHash("sha1").update(root).digest("hex").slice(0, 12);
	return `local/${name}-${hash}`;
}

export function normalizeRepositoryIdentity(remote: string): string {
	let value = remote.trim();
	if (!value) return "";
	value = value.replace(/^git\+/, "").replace(/\.git$/, "");
	const sshMatch = value.match(/^git@([^:]+):(.+)$/);
	if (sshMatch) return `${sshMatch[1]}/${sshMatch[2]}`;
	try {
		const url = new URL(value);
		if (!url.hostname || !["http:", "https:", "ssh:", "git:"].includes(url.protocol)) return "";
		return `${url.hostname}${url.pathname}`.replace(/^\/+|\/+$/g, "");
	} catch {
		return "";
	}
}

async function git(pi: ExtensionAPI, args: string[]): Promise<string> {
	try {
		return (await pi.exec("git", args, { timeout: GIT_TIMEOUT_MS })).stdout.trim();
	} catch {
		return "";
	}
}

export async function resolveTelemetryGitContext(pi: ExtensionAPI): Promise<TelemetryGitContext | undefined> {
	const [root, rawBranch, commit, remote] = await Promise.all([
		git(pi, ["rev-parse", "--show-toplevel"]),
		git(pi, ["rev-parse", "--abbrev-ref", "HEAD"]),
		git(pi, ["rev-parse", "--short", "HEAD"]),
		git(pi, ["config", "--get", "remote.origin.url"]),
	]);
	if (!root) return undefined;
	return {
		repository: normalizeRepositoryIdentity(remote) || localRepositoryIdentity(root),
		branch: rawBranch === "HEAD" ? "detached" : rawBranch || "no-branch",
		commit: commit || "no-commit",
	};
}
