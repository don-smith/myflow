#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const collectionPrefixes = {
  sources: "src-",
  inventory: "inv-",
  elements: "el-",
  relationships: "rel-",
  interfaces: "if-",
  flows: "flow-",
  data: "data-",
  terms: "term-",
  scenarios: "scn-",
  divergences: "div-",
  claims: "claim-",
  diagrams: "diag-",
};
const factCollections = ["elements", "relationships", "interfaces", "flows", "data", "terms", "scenarios", "divergences", "claims"];
const states = ["current", "intended", "both"];
const certainties = ["confirmed", "inferred", "unresolved"];
const sourceKinds = ["code", "configuration", "intent", "decision", "test", "history", "external", "developer"];
const relationshipKinds = ["source-dependency", "call", "command", "event", "data-read", "data-write", "data-ownership", "lifecycle", "build", "deploy", "trust", "intended"];
const elementKinds = ["person", "external-system", "software-system", "runtime-unit", "deploy-node", "package", "crate", "module", "store", "durable-artifact"];
const inventoryClasses = ["included", "excluded", "generated", "test", "documentation"];
const coverageValues = ["read", "not-read", "not-applicable"];
const diagramLevels = ["system-context", "runtime-unit", "module", "interface", "flow", "data", "current-intended"];
const diagramRelationships = ["boundary", "containment", "dependency", "sequence", "branching", "lifecycle", "comparison", "data"];

function diagnostic(jsonPath, value, expected) {
  return `${jsonPath}: invalid value ${JSON.stringify(value)}; expected ${expected}`;
}

function requireArray(model, key, errors) {
  if (!Array.isArray(model[key])) errors.push(diagnostic(`$.${key}`, model[key], "an array"));
}

function checkEnum(value, allowed, jsonPath, errors) {
  if (!allowed.includes(value)) errors.push(diagnostic(jsonPath, value, `one of ${allowed.join(", ")}`));
}

function evidenceKinds(item, sources) {
  return (item.evidence ?? []).map((reference) => sources.get(reference.sourceId)?.kind).filter(Boolean);
}

function checkFact(item, jsonPath, sources, errors) {
  checkEnum(item.state, states, `${jsonPath}.state`, errors);
  checkEnum(item.certainty, certainties, `${jsonPath}.certainty`, errors);
  if (!Array.isArray(item.evidence)) {
    errors.push(diagnostic(`${jsonPath}.evidence`, item.evidence, "an array of source references"));
    return;
  }
  item.evidence.forEach((reference, index) => {
    const referencePath = `${jsonPath}.evidence[${index}]`;
    if (!sources.has(reference.sourceId)) {
      errors.push(diagnostic(`${referencePath}.sourceId`, reference.sourceId, "an existing source ID"));
    }
    if (typeof reference.locator !== "string" || !reference.locator.trim()) {
      errors.push(diagnostic(`${referencePath}.locator`, reference.locator, "a non-empty file, line, commit, or external locator"));
    }
  });
  if (item.certainty === "unresolved" && (typeof item.gap !== "string" || !item.gap.trim())) {
    errors.push(diagnostic(`${jsonPath}.gap`, item.gap, "a non-empty gap for unresolved certainty"));
  }
  if (item.certainty !== "confirmed") return;
  const kinds = evidenceKinds(item, sources);
  if (["current", "both"].includes(item.state) && !kinds.some((kind) => ["code", "configuration"].includes(kind))) {
    errors.push(diagnostic(`${jsonPath}.evidence`, item.evidence, "code or configuration evidence for a confirmed current fact"));
  }
  if (["intended", "both"].includes(item.state) && !kinds.some((kind) => ["intent", "decision", "developer"].includes(kind))) {
    errors.push(diagnostic(`${jsonPath}.evidence`, item.evidence, "tracked intent or developer evidence for a confirmed intended fact"));
  }
}

export function validateModel(model) {
  const errors = [];
  if (!model || typeof model !== "object" || Array.isArray(model)) return [diagnostic("$", model, "an object")];
  if (model.schemaVersion !== "1.0.0") errors.push(diagnostic("$.schemaVersion", model.schemaVersion, '"1.0.0"'));
  checkEnum(model.status, ["in-progress", "blocked", "ready"], "$.status", errors);
  for (const key of Object.keys(collectionPrefixes)) requireArray(model, key, errors);
  if (errors.some((error) => /expected an array/.test(error))) return errors;

  const allIds = new Map();
  for (const [collection, prefix] of Object.entries(collectionPrefixes)) {
    model[collection].forEach((item, index) => {
      const idPath = `$.${collection}[${index}].id`;
      if (typeof item.id !== "string" || !item.id.startsWith(prefix)) {
        errors.push(diagnostic(idPath, item.id, `a stable ID beginning with ${prefix}`));
      }
      if (allIds.has(item.id)) errors.push(diagnostic(idPath, item.id, `a unique ID; first used at ${allIds.get(item.id)}`));
      else allIds.set(item.id, idPath);
    });
  }

  const sources = new Map(model.sources.map((source) => [source.id, source]));
  model.sources.forEach((source, index) => {
    const jsonPath = `$.sources[${index}]`;
    checkEnum(source.kind, sourceKinds, `${jsonPath}.kind`, errors);
    for (const key of ["path", "locator", "summary"]) {
      if (typeof source[key] !== "string" || !source[key].trim()) errors.push(diagnostic(`${jsonPath}.${key}`, source[key], "a non-empty string"));
    }
  });

  for (const collection of factCollections) {
    model[collection].forEach((item, index) => checkFact(item, `$.${collection}[${index}]`, sources, errors));
  }

  const elements = new Set(model.elements.map((item) => item.id));
  model.elements.forEach((element, index) => checkEnum(element.kind, elementKinds, `$.elements[${index}].kind`, errors));
  model.relationships.forEach((relationship, index) => {
    const jsonPath = `$.relationships[${index}]`;
    checkEnum(relationship.kind, relationshipKinds, `${jsonPath}.kind`, errors);
    for (const endpoint of ["from", "to"]) {
      if (!elements.has(relationship[endpoint])) errors.push(diagnostic(`${jsonPath}.${endpoint}`, relationship[endpoint], "an existing element ID"));
    }
  });

  const relationships = new Set(model.relationships.map((item) => item.id));
  model.interfaces.forEach((item, index) => {
    const jsonPath = `$.interfaces[${index}]`;
    if (!elements.has(item.owner)) errors.push(diagnostic(`${jsonPath}.owner`, item.owner, "an existing element ID"));
    (item.consumers ?? []).forEach((id, consumerIndex) => {
      if (!elements.has(id)) errors.push(diagnostic(`${jsonPath}.consumers[${consumerIndex}]`, id, "an existing element ID"));
    });
  });
  model.flows.forEach((flow, index) => {
    (flow.steps ?? []).forEach((step, stepIndex) => {
      const jsonPath = `$.flows[${index}].steps[${stepIndex}]`;
      for (const endpoint of ["actor", "target"]) {
        if (!elements.has(step[endpoint])) errors.push(diagnostic(`${jsonPath}.${endpoint}`, step[endpoint], "an existing element ID"));
      }
      if (step.relationshipId && !relationships.has(step.relationshipId)) {
        errors.push(diagnostic(`${jsonPath}.relationshipId`, step.relationshipId, "an existing relationship ID"));
      }
    });
  });
  model.data.forEach((datum, index) => {
    if (!elements.has(datum.authority)) errors.push(diagnostic(`$.data[${index}].authority`, datum.authority, "an existing element ID"));
  });

  const inventoryPaths = new Map();
  model.inventory.forEach((item, index) => {
    const jsonPath = `$.inventory[${index}]`;
    checkEnum(item.classification, inventoryClasses, `${jsonPath}.classification`, errors);
    checkEnum(item.coverage, coverageValues, `${jsonPath}.coverage`, errors);
    if (inventoryPaths.has(item.path)) errors.push(diagnostic(`${jsonPath}.path`, item.path, `a unique inventory path; first used at ${inventoryPaths.get(item.path)}`));
    else inventoryPaths.set(item.path, jsonPath);
    if (item.classification === "included" && item.coverage !== "read") {
      errors.push(diagnostic(`${jsonPath}.coverage`, item.coverage, "read; included production files must be read"));
    }
    if (typeof item.reason !== "string" || !item.reason.trim()) errors.push(diagnostic(`${jsonPath}.reason`, item.reason, "a non-empty coverage or exclusion reason"));
  });
  if (!model.scope || !Array.isArray(model.scope.expectedFiles)) {
    errors.push(diagnostic("$.scope.expectedFiles", model.scope?.expectedFiles, "the complete approved-file list"));
  } else {
    model.scope.expectedFiles.forEach((file, index) => {
      if (!inventoryPaths.has(file)) errors.push(diagnostic(`$.scope.expectedFiles[${index}]`, file, "a path represented exactly once in inventory"));
    });
  }

  model.diagrams.forEach((diagram, index) => {
    const jsonPath = `$.diagrams[${index}]`;
    checkEnum(diagram.abstractionLevel, diagramLevels, `${jsonPath}.abstractionLevel`, errors);
    checkEnum(diagram.relationshipType, diagramRelationships, `${jsonPath}.relationshipType`, errors);
    if (!Array.isArray(diagram.modelRefs) || !diagram.modelRefs.length) {
      errors.push(diagnostic(`${jsonPath}.modelRefs`, diagram.modelRefs, "one or more existing model IDs"));
    } else {
      diagram.modelRefs.forEach((id, referenceIndex) => {
        if (!allIds.has(id)) errors.push(diagnostic(`${jsonPath}.modelRefs[${referenceIndex}]`, id, "an existing model ID"));
      });
    }
  });

  return errors;
}

export async function readAndValidateModel(file) {
  let model;
  try {
    model = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    return { model: undefined, errors: [`$: invalid JSON in ${file}; expected a parseable architecture model (${error.message})`] };
  }
  return { model, errors: validateModel(model) };
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: check-model.mjs <architecture-model.json>");
  const { errors } = await readAndValidateModel(path.resolve(file));
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log(`valid architecture model: ${file}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
