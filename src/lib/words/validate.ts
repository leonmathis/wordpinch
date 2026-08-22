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
  /**
   * "api" — the Free Dictionary API vouched for the word (definitions attached).
   * "wordlist" — accepted via ENABLE (API 404'd, was empty, or was unreachable).
   * "rejected" — neither source knows it, or it failed a pre-check.
   */
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
 * Validates a word against the Free Dictionary API, with the ENABLE wordlist
 * as a second opinion in *both* modes:
 *
 *  - loose (allowProperNouns): valid if the API knows it OR it's in ENABLE.
 *    The API's coverage is far thinner than ENABLE's — it 404s on ordinary
 *    derived forms ("punisher", "polisher", "payor", "tinkerer") — so a 404
 *    is not evidence that a word isn't real.
 *  - strict: ENABLE membership is required (checked up front, before the API
 *    call). The API only enriches the response with phonetic / definitions.
 *
 * The fallback also covers API outage, so the game keeps working when
 * dictionaryapi.dev is down.
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

  /**
   * The API declined to vouch for the word — 404, empty body, or unreachable.
   * ENABLE gets the final say either way. In strict mode membership was
   * already proven above, so this costs nothing; in loose mode it's the
   * lookup that keeps a thin dictionary from rejecting real words.
   */
  const decideFromWordlist = async (): Promise<ValidationResult> => {
    const inList = enableHit || (await isInWordlist(word).catch(() => false));
    return { valid: inList, word, source: inList ? "wordlist" : "rejected" };
  };

  try {
    const res = await fetch(
      `${DICT_API}/${encodeURIComponent(word)}`,
      { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
    );

    if (res.status === 404) {
      // API doesn't know the word — that's a coverage gap, not a verdict.
      // ENABLE decides.
      return await decideFromWordlist();
    }

    if (res.ok) {
      const data = (await res.json()) as DictApiEntry[];
      const entry = data[0];
      if (!entry) {
        return await decideFromWordlist();
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

  // Non-OK status or a thrown request — same fallback.
  return await decideFromWordlist();
}
