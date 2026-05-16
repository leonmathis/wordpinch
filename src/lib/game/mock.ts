export type Player = { name: string; online: boolean; score: number };
export type UsedWord = { round: number; word: string; ipa: string; by: string };

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
    for (const value of Object.values(obj as Record<string, unknown>)) {
      deepFreeze(value);
    }
    Object.freeze(obj);
  }
  return obj;
}

export const MOCK = deepFreeze({
  roomCode: "SLATE-9F",
  url: "wordpinch.app/r/slate-9f",
  you:  { name: "you",  online: true,  score: 2 } as Player,
  them: { name: "sanj", online: true,  score: 1 } as Player,
  total: 5,
  round: 3,
  letterStart: "T",
  letterEnd: "H",
  word: "TRUTH",
  ipa: "/truːθ/",
  used: [
    { round: 1, word: "planet", ipa: "/ˈplænɪt/",   by: "sanj" },
    { round: 2, word: "tomato", ipa: "/təˈmɑːtəʊ/", by: "you"  },
    { round: 3, word: "kindle", ipa: "/ˈkɪndl/",    by: "you"  },
    { round: 4, word: "truth",  ipa: "/truːθ/",     by: "you"  },
    { round: 5, word: "amber",  ipa: "/ˈæmbə/",     by: "sanj" },
  ] as UsedWord[],
});
