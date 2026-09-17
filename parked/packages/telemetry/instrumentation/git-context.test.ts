import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { normalizeRepositoryIdentity, resolveTelemetryGitContext } from "./git-context.js";

function piWithGitResponses(responses: Record<string, string>): ExtensionAPI {
	return {
		exec: vi.fn(async (_command: string, args: string[]) => {
			const response = responses[args.join(" ")];
			if (response === undefined) throw new Error(`unexpected git invocation: ${args.join(" ")}`);
			return { stdout: response };
		}),
	} as unknown as ExtensionAPI;
}

describe("normalizeRepositoryIdentity", () => {
	it.each([
		["git@github.com:acme/widgets.git", "github.com/acme/widgets"],
		["https://user:token@github.com/acme/widgets.git", "github.com/acme/widgets"],
		["git+https://github.com/acme/widgets.git", "github.com/acme/widgets"],
		["file:///Users/alice/private.git", ""],
		["/Users/alice/private", ""],
	])("normalizes %s without retaining credentials", (remote, expected) => {
		expect(normalizeRepositoryIdentity(remote)).toBe(expected);
	});
});

describe("resolveTelemetryGitContext", () => {
	it("resolves repository, branch, and commit concurrently", async () => {
		const pi = piWithGitResponses({
			"rev-parse --show-toplevel": "/workspace/widgets\n",
			"rev-parse --abbrev-ref HEAD": "feature/telemetry\n",
			"rev-parse --short HEAD": "abc1234\n",
			"config --get remote.origin.url": "git@github.com:acme/widgets.git\n",
		});

		await expect(resolveTelemetryGitContext(pi)).resolves.toEqual({
			repository: "github.com/acme/widgets",
			branch: "feature/telemetry",
			commit: "abc1234",
		});
		expect(pi.exec).toHaveBeenCalledTimes(4);
	});

	it("uses a stable local identity when origin is absent and names detached HEAD", async () => {
		const pi = piWithGitResponses({
			"rev-parse --show-toplevel": "/workspace/widgets\n",
			"rev-parse --abbrev-ref HEAD": "HEAD\n",
			"rev-parse --short HEAD": "abc1234\n",
			"config --get remote.origin.url": "",
		});

		await expect(resolveTelemetryGitContext(pi)).resolves.toMatchObject({
			repository: expect.stringMatching(/^local\/widgets-[a-f0-9]{12}$/),
			branch: "detached",
			commit: "abc1234",
		});
	});

	it("returns no context outside a Git repository", async () => {
		await expect(resolveTelemetryGitContext(piWithGitResponses({}))).resolves.toBeUndefined();
	});
});
