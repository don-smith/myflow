/**
 * Thin Pi extension entry. The instrumentation module registers configured
 * providers before attaching lifecycle handlers.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { initInstrumentation } from "./instrumentation/index.js";

export default function (pi: ExtensionAPI): void {
	initInstrumentation(pi);
}
