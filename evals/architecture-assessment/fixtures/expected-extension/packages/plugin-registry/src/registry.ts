import type { PluginRegistration } from "./types.js";

export const registry: PluginRegistration[] = [
  { id: "documents", owner: "content-docs", capabilities: ["file:read", "file:write"] },
  { id: "notes", owner: "content-notes", capabilities: ["file:write"] },
];
