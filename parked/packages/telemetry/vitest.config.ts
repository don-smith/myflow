import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		setupFiles: ["./test/setup.ts"],
		unstubGlobals: true,
		clearMocks: true,
		restoreMocks: true,
	},
});
