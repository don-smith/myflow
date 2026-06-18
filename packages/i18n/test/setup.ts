import { beforeEach } from "vitest";
import { __resetState, I18N_STATE_KEY } from "../i18n.js";

beforeEach(() => {
	__resetState();
	delete (globalThis as unknown as Record<symbol, unknown>)[I18N_STATE_KEY];
});