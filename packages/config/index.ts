import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { type Static, Type } from "typebox";
import { Value } from "typebox/value";

/** Shared, fail-soft configuration helpers for MyFlow's optional Pi extensions. */
export function configPath(feature: string): string {
  return join(homedir(), ".myflow", "config", feature, "config.json");
}

export function loadJsonConfig<T>(path: string): T {
  try {
    if (!existsSync(path)) return {} as T;
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as T) : ({} as T);
  } catch {
    return {} as T;
  }
}

export function saveJsonConfig(path: string, value: unknown): boolean {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}

export function readEnvVar(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

/** Return a schema-valid object or a safe empty value when persisted config is malformed. */
export function validateConfig<T>(schema: Parameters<typeof Value.Check>[0], value: unknown): T {
  return Value.Check(schema, value) ? (value as T) : ({} as T);
}

export const GuidanceFieldsSchema = Type.Object(
  {
    promptSnippet: Type.Optional(Type.String({ minLength: 1 })),
    promptGuidelines: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
  },
  { additionalProperties: false },
);

export type GuidanceFields = Static<typeof GuidanceFieldsSchema>;

export function validateGuidanceFields(value: unknown): GuidanceFields {
  return Value.Check(GuidanceFieldsSchema, value) ? (value as GuidanceFields) : {};
}
