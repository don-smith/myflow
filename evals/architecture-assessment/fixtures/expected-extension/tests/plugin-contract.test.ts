import assert from "node:assert/strict";
import { registry } from "../packages/plugin-registry/src/registry.js";

assert.deepEqual(registry.map((plugin) => plugin.id), ["documents", "notes"]);
assert.equal(new Set(registry.map((plugin) => plugin.id)).size, registry.length);
