import type { GuidanceFields } from "../config/index.js";
import { configPath, loadJsonConfig, validateGuidanceFields } from "../config/index.js";

const CONFIG_PATH = configPath("ask-user-question");

interface AskUserQuestionConfig {
	guidance?: GuidanceFields;
}

export function loadConfig(): AskUserQuestionConfig {
	return loadJsonConfig<AskUserQuestionConfig>(CONFIG_PATH);
}

export { validateGuidanceFields };
