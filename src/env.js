import fs from "node:fs/promises";
import path from "node:path";

export async function loadDotEnv(dotEnvPath = ".env") {
  const absolutePath = path.resolve(dotEnvPath);
  let raw;
  try {
    raw = await fs.readFile(absolutePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }

    const key = match[1];
    const value = parseValue(match[2]);
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parseValue(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const unquoted = trimmed.slice(1, -1);
    return unquoted
      .replaceAll("\\n", "\n")
      .replaceAll("\\r", "\r")
      .replaceAll("\\t", "\t")
      .replaceAll('\\"', '"')
      .replaceAll("\\'", "'")
      .replaceAll("\\\\", "\\");
  }
  return trimmed;
}
