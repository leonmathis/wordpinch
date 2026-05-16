import "server-only";
import { gunzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import path from "node:path";

let wordsetPromise: Promise<Set<string>> | null = null;

const DATA_PATH = path.join(
  process.cwd(),
  "src",
  "lib",
  "words",
  "data",
  "enable1.txt.gz"
);

async function loadWordlist(): Promise<Set<string>> {
  const buf = await readFile(DATA_PATH);
  const text = gunzipSync(buf).toString("utf8");
  const set = new Set<string>();
  for (const line of text.split("\n")) {
    const w = line.trim().toLowerCase();
    if (w) set.add(w);
  }
  return set;
}

/**
 * Lazily-loaded ENABLE1 wordlist (~173K words). The Set is cached for the
 * lifetime of the server process; first call pays the ~50–100ms decompress
 * cost, subsequent calls are O(1).
 */
export function getWordlist(): Promise<Set<string>> {
  if (!wordsetPromise) {
    wordsetPromise = loadWordlist().catch((err) => {
      wordsetPromise = null;
      throw err;
    });
  }
  return wordsetPromise;
}

export async function isInWordlist(word: string): Promise<boolean> {
  if (!word) return false;
  const set = await getWordlist();
  return set.has(word.toLowerCase());
}
