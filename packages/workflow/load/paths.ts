/**
 * Overlay file system paths for the user and project layers.
 *
 *   user    — config `~/.myflow/config/workflow/config.ts`
 *             packs  `~/.myflow/config/workflow/packs/*.ts`
 *   project — config `<cwd>/.myflow/workflows/config.ts`
 *             packs  `<cwd>/.myflow/workflows/packs/*.ts`
 *
 * Project config lives under the unified `.myflow/<domain>/` tree alongside
 * run state (`.myflow/workflows/runs/`), so the package no longer carries the
 * legacy `.workflow/` outlier directory.
 */

import { join } from "node:path";
import { configPath } from "@myflow/config";

export interface OverlayPaths {
	/** Config file — the only place `default` may live. */
	configFile: string;
	/** Packs directory — alpha-sorted `*.ts` files merged before the config file. */
	packsDir: string;
}

/** Project overlay paths under `<cwd>/.myflow/workflows/`. */
export function projectOverlayPaths(cwd: string): OverlayPaths {
	const root = join(cwd, ".myflow", "workflows");
	return { configFile: join(root, "config.ts"), packsDir: join(root, "packs") };
}

/** User overlay paths under `~/.myflow/config/workflow/`. */
export function userOverlayPaths(): OverlayPaths {
	return {
		configFile: configPath("workflow", "config.ts"),
		packsDir: configPath("workflow", "packs"),
	};
}
