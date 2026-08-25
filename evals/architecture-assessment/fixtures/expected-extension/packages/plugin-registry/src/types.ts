export type Capability = "file:read" | "file:write";
export type PluginId = "documents" | "notes";

export type PluginRegistration = {
  id: PluginId;
  owner: string;
  capabilities: Capability[];
};
