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
  /** First non-empty audio URL from the Free Dictionary API, if any. */
  audio?: string;
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
  phonetics?: { text?: string; audio?: string }[];
  meanings?: {
    partOfSpeech?: string;
    definitions?: { definition?: string; example?: string }[];
  }[];
};

function parseEntry(
  entry: DictApiEntry
): Pick<ValidationResult, "phonetic" | "audio" | "definitions"> {
  const phonetic =
    entry.phonetic ?? entry.phonetics?.find((p) => p.text)?.text ?? undefined;
  const audio = entry.phonetics?.find((p) => p.audio)?.audio ?? undefined;

  // Take 1 definition per part of speech first (noun + verb + adj…), then
  // backfill with additional defs from the same POS if we still have room.
  const definitions: Definition[] = [];
  const seenPos = new Set<string>();
  for (const meaning of entry.meanings ?? []) {
    const pos = meaning.partOfSpeech ?? "";
    const first = meaning.definitions?.find((d) => d.definition);
    if (!first?.definition) continue;
    definitions.push({
      partOfSpeech: pos,
      definition: first.definition,
      example: first.example,
    });
    seenPos.add(pos);
    if (definitions.length >= MAX_DEFINITIONS) break;
  }
  if (definitions.length < MAX_DEFINITIONS) {
    for (const meaning of entry.meanings ?? []) {
      const pos = meaning.partOfSpeech ?? "";
      // Skip the first def — already taken in the loop above.
      const extras = (meaning.definitions ?? []).filter((d) => d.definition).slice(1);
      for (const def of extras) {
        definitions.push({
          partOfSpeech: pos,
          definition: def.definition!,
          example: def.example,
        });
        if (definitions.length >= MAX_DEFINITIONS) break;
      }
      if (definitions.length >= MAX_DEFINITIONS) break;
    }
  }
  return { phonetic, audio, definitions };
}

type ValidateOpts = {
  /**
   * When false, the word MUST appear in the ENABLE wordlist. ENABLE was built
   * for word games and excludes proper nouns / abbreviations, so this is the
   * practical proxy for "no proper nouns". Defaults to true.
   */
  allowProperNouns?: boolean;
};

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
export async function validateWord(
  rawWord: string,
  opts?: ValidateOpts
): Promise<ValidationResult> {
  const word = rawWord.trim().toLowerCase();
  if (!word) {
    return { valid: false, word, source: "rejected" };
  }

  const allowProper = opts?.allowProperNouns ?? true;

  // If proper nouns are disallowed, require ENABLE membership up front. If the
  // word isn't in ENABLE, reject immediately without spending an API call.
  let enableHit = false;
  if (!allowProper) {
    enableHit = await isInWordlist(word).catch(() => false);
    if (!enableHit) {
      return { valid: false, word, source: "rejected" };
    }
  }

  try {
    const res = await fetch(
      `${DICT_API}/${encodeURIComponent(word)}`,
      { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
    );

    if (res.status === 404) {
      // API doesn't know the word. If we already confirmed it via ENABLE
      // (proper-nouns disallowed path), accept it without definitions.
      if (enableHit) {
        return { valid: true, word, source: "wordlist" };
      }
      return { valid: false, word, source: "api" };
    }

    if (res.ok) {
      const data = (await res.json()) as DictApiEntry[];
      const entry = data[0];
      if (!entry) {
        if (enableHit) return { valid: true, word, source: "wordlist" };
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

  // API failed. If we already passed ENABLE, accept without definitions.
  if (enableHit) {
    return { valid: true, word, source: "wordlist" };
  }
  const inList = await isInWordlist(word).catch(() => false);
  return { valid: inList, word, source: "wordlist" };
}
