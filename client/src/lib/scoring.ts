import { Card, Chain } from "@/types/game";

export interface ChainValidationResult {
  isValid: boolean;
  points: number;
  reason?: string;
}

export function validateChain(cards: Card[]): ChainValidationResult {
  // 1. Darabszám ellenőrzés
  if (cards.length !== 3 && cards.length !== 4) {
    return { isValid: false, points: 0, reason: "A lánc csak 3 vagy 4 kártyából állhat." };
  }

  // 2. Típusok ellenőrzése
  const types = cards.map(c => c.type);
  const hasPerson = types.includes('SZEMÉLY');
  const hasLocation = types.includes('HELYSZÍN');
  const hasEvent = types.includes('ESEMÉNY');
  const hasDate = types.includes('IDŐPONT');

  if (!hasPerson || !hasLocation || !hasEvent) {
    return { isValid: false, points: 0, reason: "Hiányzik a Személy, Helyszín vagy Esemény!" };
  }

  if (cards.length === 4 && !hasDate) {
    return { isValid: false, points: 0, reason: "4 kártyás lánchoz kell Időpont is!" };
  }

  // 3. Logikai összetartozás ellenőrzése (Lánc ID alapján)
  const firstChain = cards[0].chain;
  const allSameChain = cards.every(c => c.chain === firstChain);

  if (!allSameChain) {
    // Ha nem tartoznak össze, akkor is "valid" a bejelentés (megtörténhet),
    // de a pontszám negatív lesz.
    // A szabály: "Ha helytelen a bejelentett lánc, ugyanennyi mínusz pontot ér".
    const potentialPoints = cards.length === 3 ? 2 : 4;
    // isValid: true, mert a bejelentés megtörténik, csak büntetést kap
    return { isValid: true, points: -potentialPoints, reason: "HIBÁS LÁNC! (Nem tartoznak össze)" }; 
  }

  // 4. Pontszámítás (Helyes lánc)
  if (cards.length === 3) {
    return { isValid: true, points: 2 };
  } else {
    return { isValid: true, points: 4 };
  }
}

export function calculateFinalScore(chains: Chain[], hand: Card[]): number {
  let score = 0;

  // Láncok pontjai (már tartalmazzák a pozitív vagy negatív pontokat)
  chains.forEach(chain => {
    score += chain.points;
  });

  // Kézben maradt lapok büntetése (-1 pont/lap)
  score -= hand.length;

  return score;
}
