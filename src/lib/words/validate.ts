import "server-only";
import { isInWordlist } from "./wordlist";

export type Definition = {
  partOfSpeech: string;
  definition: string;
  example?: string;
};

export type ValidationResult = {
  valid: boolean;
  word: string;
  phonetic?: string;
  definitions?: Definition[];
  /** "api" if the Free Dictionary API responded, "wordlist" if we fell back. */
  source: "api" | "wordlist" | "rejected";
};

const DICT_API = "https://api.dictionaryapi.dev/api/v2/entries/en";
const REQUEST_TIMEOUT_MS = 2000;
const MAX_DEFINITIONS = 2;

type DictApiEntry = {
  word?: string;
  phonetic?: string;
  phonetics?: { text?: string }[];
  meanings?: {
    partOfSpeech?: string;
    definitions?: { definition?: string; example?: string }[];
  }[];
};

function parseEntry(entry: DictApiEntry): Pick<ValidationResult, "phonetic" | "definitions"> {
  const phonetic =
    entry.phonetic ?? entry.phonetics?.find((p) => p.text)?.text ?? undefined;
  const definitions: Definition[] = [];
  for (const meaning of entry.meanings ?? []) {
    for (const def of meaning.definitions ?? []) {
      if (!def.definition) continue;
      definitions.push({
        partOfSpeech: meaning.partOfSpeech ?? "",
        definition: def.definition,
        example: def.example,
      });
      if (definitions.length >= MAX_DEFINITIONS) break;
    }
    if (definitions.length >= MAX_DEFINITIONS) break;
  }
  return { phonetic, definitions };
}

/**
 * Validates a word against the Free Dictionary API. Falls back to the ENABLE
 * wordlist (no phonetic / definitions) on API outage so the game keeps
 * working when dictionaryapi.dev is down.
 *
 * Caller is expected to have already enforced:
 *  - format ([a-z]+)
 *  - min length per room settings
 *  - first / last letter constraint
 *  - no-repeat (if enabled)
 */
export async function validateWord(rawWord: string): Promise<ValidationResult> {
  const word = rawWord.trim().toLowerCase();
  if (!word) {
    return { valid: false, word, source: "rejected" };
  }

  try {
    const res = await fetch(
      `${DICT_API}/${encodeURIComponent(word)}`,
      { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
    );

    if (res.status === 404) {
      return { valid: false, word, source: "api" };
    }

    if (res.ok) {
      const data = (await res.json()) as DictApiEntry[];
      const entry = data[0];
      if (!entry) {
        return { valid: false, word, source: "api" };
      }
      const parsed = parseEntry(entry);
      return {
        valid: true,
        word,
        source: "api",
        ...parsed,
      };
    }
    // Non-OK, non-404 (5xx, 429, etc.) → fall through to wordlist.
  } catch {
    // Network / timeout / parse error → fall through to wordlist.
  }

  const inList = await isInWordlist(word).catch(() => false);
  return { valid: inList, word, source: "wordlist" };
}
