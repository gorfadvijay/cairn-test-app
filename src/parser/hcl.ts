import { readFileSync } from "fs";
import type { CairnConfig, PostgresConfig, RedisConfig } from "./types.ts";

/**
 * Simple HCL parser for cairn.hcl
 *
 * Parses blocks like:
 *   project "my-app" { runtime = "bun" }
 *   service "api" { command = "bun run src/index.ts" }
 *   postgres "main" { version = "16" }
 *
 * Supports both single-line and multi-line blocks.
 * This is NOT a full HCL parser. It only handles Cairn's spec format.
 */

interface Block {
  type: string;
  name: string;
  attrs: Record<string, unknown>;
  children: Block[];
}

export function parseCairnHcl(filePath: string): CairnConfig {
  const content = readFileSync(filePath, "utf-8");
  const blocks = parseBlocks(content);
  return blocksToConfig(blocks);
}

function parseBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!.trim();

    if (!line || line.startsWith("#") || line.startsWith("//")) {
      i++;
      continue;
    }

    // Match single-line block: type "name" { attrs } or type "name" {}
    const inlineNamedMatch = line.match(
      /^(\w+)\s+"([^"]+)"\s*\{(.*)\}\s*$/,
    );
    if (inlineNamedMatch) {
      const type = inlineNamedMatch[1]!;
      const name = inlineNamedMatch[2]!;
      const inlineContent = inlineNamedMatch[3]!.trim();
      const attrs = parseInlineAttrs(inlineContent);
      blocks.push({ type, name, attrs, children: [] });
      i++;
      continue;
    }

    // Match multi-line block opening: type "name" {
    const blockMatch = line.match(/^(\w+)\s+"([^"]+)"\s*\{\s*$/);
    if (blockMatch) {
      const type = blockMatch[1]!;
      const name = blockMatch[2]!;
      const { block, endIndex } = parseBlockContent(lines, i + 1);
      blocks.push({ type, name, ...block });
      i = endIndex + 1;
      continue;
    }

    // Match single-line anonymous block: type { attrs } or type {}
    const inlineAnonMatch = line.match(/^(\w+)\s*\{(.*)\}\s*$/);
    if (inlineAnonMatch && !line.includes("=")) {
      const type = inlineAnonMatch[1]!;
      const inlineContent = inlineAnonMatch[2]!.trim();
      const attrs = parseInlineAttrs(inlineContent);
      blocks.push({ type, name: type, attrs, children: [] });
      i++;
      continue;
    }

    // Match multi-line anonymous block: type {
    const anonBlockMatch = line.match(/^(\w+)\s*\{\s*$/);
    if (anonBlockMatch) {
      const type = anonBlockMatch[1]!;
      const { block, endIndex } = parseBlockContent(lines, i + 1);
      blocks.push({ type, name: type, ...block });
      i = endIndex + 1;
      continue;
    }

    i++;
  }

  return blocks;
}

/**
 * Parse inline attributes from a single line: `key = "value", key2 = true`
 */
function parseInlineAttrs(content: string): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  if (!content) return attrs;

  // Split on key = value patterns, handling quoted strings
  const attrRegex = /(\w+)\s*=\s*("(?:[^"\\]|\\.)*"|true|false|\d+|[\w.]+)/g;
  let match;
  while ((match = attrRegex.exec(content)) !== null) {
    attrs[match[1]!] = parseValue(match[2]!);
  }
  return attrs;
}

function parseBlockContent(
  lines: string[],
  startIndex: number,
): {
  block: { attrs: Record<string, unknown>; children: Block[] };
  endIndex: number;
} {
  const attrs: Record<string, unknown> = {};
  const children: Block[] = [];
  let depth = 1;
  let i = startIndex;

  while (i < lines.length && depth > 0) {
    const line = lines[i]!.trim();

    if (!line || line.startsWith("#") || line.startsWith("//")) {
      i++;
      continue;
    }

    if (line === "}") {
      depth--;
      if (depth === 0) break;
      i++;
      continue;
    }

    // Single-line nested named block: name "label" { ... }
    const inlineNestedNamed = line.match(
      /^(\w+)\s+"([^"]+)"\s*\{(.*)\}\s*$/,
    );
    if (inlineNestedNamed) {
      const type = inlineNestedNamed[1]!;
      const name = inlineNestedNamed[2]!;
      const inlineContent = inlineNestedNamed[3]!.trim();
      const childAttrs = parseInlineAttrs(inlineContent);
      children.push({ type, name, attrs: childAttrs, children: [] });
      i++;
      continue;
    }

    // Multi-line nested named block: name "label" {
    const nestedNamedMatch = line.match(/^(\w+)\s+"([^"]+)"\s*\{\s*$/);
    if (nestedNamedMatch) {
      const type = nestedNamedMatch[1]!;
      const name = nestedNamedMatch[2]!;
      const { block, endIndex } = parseBlockContent(lines, i + 1);
      children.push({ type, name, ...block });
      i = endIndex + 1;
      continue;
    }

    // Single-line nested anonymous block: name { ... }
    const inlineNestedAnon = line.match(/^(\w+)\s*\{(.*)\}\s*$/);
    if (inlineNestedAnon && !line.includes("=")) {
      const type = inlineNestedAnon[1]!;
      const inlineContent = inlineNestedAnon[2]!.trim();
      const childAttrs = parseInlineAttrs(inlineContent);
      children.push({ type, name: type, attrs: childAttrs, children: [] });
      i++;
      continue;
    }

    // Multi-line nested anonymous block: name {
    const nestedMatch = line.match(/^(\w+)\s*\{\s*$/);
    if (nestedMatch && !line.includes("=")) {
      const type = nestedMatch[1]!;
      const { block, endIndex } = parseBlockContent(lines, i + 1);
      children.push({ type, name: type, ...block });
      i = endIndex + 1;
      continue;
    }

    // Attribute: key = value
    const attrMatch = line.match(/^(\w+)\s*=\s*(.+)$/);
    if (attrMatch) {
      const key = attrMatch[1]!;
      const rawValue = attrMatch[2]!;
      attrs[key] = parseValue(rawValue.trim());
    }

    i++;
  }

  return { block: { attrs, children }, endIndex: i };
}

function parseValue(raw: string): unknown {
  // Remove trailing comma if present
  raw = raw.replace(/,\s*$/, "").trim();

  // Array: ["a", "b", "c"]
  if (raw.startsWith("[") && raw.endsWith("]")) {
    const inner = raw.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((item) => {
      const trimmed = item.trim();
      if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        return trimmed.slice(1, -1);
      }
      return parseValue(trimmed);
    });
  }

  // String: "value"
  if (raw.startsWith('"') && raw.endsWith('"')) {
    return raw.slice(1, -1);
  }

  // Boolean
  if (raw === "true") return true;
  if (raw === "false") return false;

  // Number
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);

  // Reference: postgres.main.url
  if (/^[\w.]+$/.test(raw)) return { ref: raw };

  return raw;
}

function blocksToConfig(blocks: Block[]): CairnConfig {
  const config: CairnConfig = {
    project: { name: "app", runtime: "bun" },
    services: [],
    postgres: [],
    redis: [],
    storage: [],
    secrets: [],
    auth: [],
  };

  for (const block of blocks) {
    switch (block.type) {
      case "project":
        config.project = {
          name: block.name,
          runtime:
            (block.attrs.runtime as CairnConfig["project"]["runtime"]) ||
            "bun",
        };
        break;

      case "service": {
        const devBlock = block.children.find((c) => c.type === "dev");
        config.services.push({
          name: block.name,
          build: block.attrs.build as string | undefined,
          command: block.attrs.command as string,
          expose: block.attrs.expose as boolean | undefined,
          dev: devBlock
            ? { command: devBlock.attrs.command as string }
            : undefined,
          env: buildEnvMap(block),
        });
        break;
      }

      case "postgres":
        config.postgres.push({
          name: block.name,
          version: (block.attrs.version as string) || "16",
          vendor: block.attrs.vendor as PostgresConfig["vendor"],
        });
        break;

      case "redis":
        config.redis.push({
          name: block.name,
          version: (block.attrs.version as string) || "7",
          vendor: block.attrs.vendor as RedisConfig["vendor"],
        });
        break;

      case "storage":
        config.storage.push({ name: block.name });
        break;

      case "secret":
        config.secrets.push({ name: block.name });
        break;

      case "auth": {
        const providers = block.attrs.providers;
        config.auth.push({
          name: block.name,
          providers: Array.isArray(providers)
            ? (providers as string[])
            : typeof providers === "string"
              ? providers.split(",").map((p: string) => p.trim())
              : ["email"],
          session:
            (block.attrs.session as "jwt" | "database") || "database",
        });
        break;
      }
    }
  }

  return config;
}

function buildEnvMap(block: Block): Record<string, string> {
  const envBlock = block.children.find((c) => c.type === "env");
  if (!envBlock) return {};
  return envBlock.attrs as Record<string, string>;
}
