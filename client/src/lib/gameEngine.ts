import { Card, GameState, Move, Player } from "@/types/game";
import { INITIAL_DECK } from "./cardData";

export const BOARD_SIZE = 10;

export function createInitialState(playerCount: number, mode: 'light' | 'advanced' = 'light'): GameState {
  const players: Player[] = Array.from({ length: playerCount }, (_, i) => ({
    id: i,
    name: `${i + 1}. Játékos`,
    color: ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'cyan', 'magenta'][i] as any,
    score: 0,
    hand: [],
    chains: [],
    position: null,
    isEliminated: false
  }));

  // Kártyák betöltése (Custom vagy Default)
  let sourceDeck = INITIAL_DECK;
  try {
    const customDeckStr = localStorage.getItem('customDeck');
    if (customDeckStr) {
      const customDeck = JSON.parse(customDeckStr);
      if (Array.isArray(customDeck) && customDeck.length >= 10) {
        sourceDeck = customDeck;
        console.log("Custom deck loaded:", sourceDeck.length, "cards");
      }
    }
  } catch (e) {
    console.error("Failed to load custom deck:", e);
  }

  // Kártyák keverése
  const deck = [...sourceDeck].sort(() => Math.random() - 0.5);

  // Kezdőosztás: 5 lap mindenkinek
  players.forEach(player => {
    for (let i = 0; i < 5; i++) {
      if (deck.length > 0) {
        player.hand.push(deck.pop()!);
      }
    }
  });

  // Tábla inicializálása (üres)
  const board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));

  return {
    players,
    currentPlayerIndex: 0,
    board,
    deck,
    discards: [],
    turnCount: 0,
    phase: 'setup', // Pályaépítéssel kezdünk
    lastDrawnCardId: null,
    timeLeft: mode === 'light' ? 15 * 60 : 30 * 60,
    isGameOver: false,
    winnerId: null,
    settings: {
      playerCount,
      timeLimitMinutes: mode === 'light' ? 15 : 30,
      mode
    },
    logs: ['A játék elkezdődött. Építsétek meg a pályát!']
  };
}

export function isValidKnightMove(from: { x: number; y: number }, to: { x: number; y: number }): boolean {
  const dx = Math.abs(from.x - to.x);
  const dy = Math.abs(from.y - to.y);
  return (dx === 1 && dy === 2) || (dx === 2 && dy === 1);
}

export function getValidMoves(state: GameState, playerId: number): { x: number; y: number }[] {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return [];

  // Setup fázis: Bárhová rakhat kártyát, ami üres és szomszédos (kivéve az elsőt)
  if (state.phase === 'setup') {
    const moves: { x: number; y: number }[] = [];
    const hasAnyCard = state.board.some(row => row.some(cell => cell !== null));

    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        if (state.board[y][x] === null) {
          // Ha még nincs kártya, bárhová rakhat (de célszerű középre)
          if (!hasAnyCard) {
            moves.push({ x, y });
          } else {
            // Ha van már kártya, csak szomszédosra (átlós is jó)
            const hasNeighbor = [
              { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
              { dx: -1, dy: 0 },                     { dx: 1, dy: 0 },
              { dx: -1, dy: 1 },  { dx: 0, dy: 1 },  { dx: 1, dy: 1 }
            ].some(d => {
              const nx = x + d.dx;
              const ny = y + d.dy;
              return nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && state.board[ny][nx] !== null;
            });

            if (hasNeighbor) {
              moves.push({ x, y });
            }
          }
        }
      }
    }
    return moves;
  }

  // Setup Token fázis: Bárhová rakhat bábut, ami ÜRES (nincs kártya és nincs bábu)
  if (state.phase === 'setup_token') {
    const moves: { x: number; y: number }[] = [];
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const isOccupiedByPlayer = state.players.some(p => p.position?.x === x && p.position?.y === y);
        const hasCard = state.board[y][x] !== null;
        if (!isOccupiedByPlayer && !hasCard) {
          moves.push({ x, y });
        }
      }
    }
    return moves;
  }

  // Normál mozgás
  if (!player.position) return []; // Elvileg ilyenkor már van pozíciója

  const moves: { x: number; y: number }[] = [];
  const directions = [
    { x: 1, y: 2 }, { x: 1, y: -2 }, { x: -1, y: 2 }, { x: -1, y: -2 },
    { x: 2, y: 1 }, { x: 2, y: -1 }, { x: -2, y: 1 }, { x: -2, y: -1 }
  ];

  // 1. Gyűjtsük ki az összes lehetséges lóugrást
  const possibleMoves: { x: number; y: number; isCard: boolean }[] = [];

  directions.forEach(d => {
    const newX = player.position!.x + d.x;
    const newY = player.position!.y + d.y;

    if (newX >= 0 && newX < BOARD_SIZE && newY >= 0 && newY < BOARD_SIZE) {
      // Ellenőrizzük, hogy nincs-e ott másik játékos
      const isOccupied = state.players.some(p => p.position?.x === newX && p.position?.y === newY);
      
      if (!isOccupied) {
        const hasCard = state.board[newY][newX] !== null;
        possibleMoves.push({ x: newX, y: newY, isCard: hasCard });
      }
    }
  });

  // 2. KÉNYSZER SZABÁLY: Ha van kártyás lépés, CSAK azokat adjuk vissza
  const cardMoves = possibleMoves.filter(m => m.isCard);
  
  if (cardMoves.length > 0) {
    return cardMoves.map(m => ({ x: m.x, y: m.y }));
  }

  // Ha nincs kártyás lépés, bármelyik üresre léphet
  return possibleMoves.map(m => ({ x: m.x, y: m.y }));
}

export function executeMove(state: GameState, move: Move): GameState {
  const newState = JSON.parse(JSON.stringify(state)); // Deep copy
  const player = newState.players[newState.currentPlayerIndex];

  // Mozgás végrehajtása
  player.position = move.to;
  
  // Kártya felvétele (ha van)
  const cardOnBoard = newState.board[move.to.y][move.to.x];
  if (cardOnBoard) {
    // Ha rejtett volt, felfedjük a játékosnak (a kézben már nyílt lesz)
    const card = { ...cardOnBoard, isHidden: false };
    player.hand.push(card);
    newState.board[move.to.y][move.to.x] = null;
    newState.logs.push(`${player.name} felvett egy kártyát.`);
  } else {
    newState.logs.push(`${player.name} üres mezőre lépett.`);
  }

  // Fázis váltás: Mozgás -> Ellenőrzés -> Húzás
  // Ha felvett kártyát és ezzel 5 fölé ment a kéz, akkor kötelező lerakni
  if (player.hand.length > 5) {
    newState.phase = 'place_after_move';
    newState.logs.push(`${player.name} keze megtelt (>5), kötelező leraknia egy lapot!`);
  } else {
    newState.phase = 'draw';
  }
  newState.lastDrawnCardId = null;
  
  return newState;
}

export function drawCard(state: GameState): GameState {
  const newState = JSON.parse(JSON.stringify(state));
  const player = newState.players[newState.currentPlayerIndex];

  if (newState.deck.length > 0) {
    const card = newState.deck.pop();
    player.hand.push(card);
    newState.lastDrawnCardId = card.id; // Elmentjük, mit húzott most
    newState.logs.push(`${player.name} húzott egy kártyát a talonból.`);
  } else {
    newState.logs.push(`A pakli elfogyott!`);
    // Opcionális: játék vége logika, ha már lépni se tudnak
  }

  // Fázis váltás: Húzás -> Lerakás
  if (player.hand.length > 5) {
    newState.phase = 'place_after_draw';
    newState.logs.push(`${player.name} keze megtelt (>5), kötelező leraknia egy lapot!`);
  } else {
    newState.phase = 'place'; // Opcionális lerakás
  }

  return newState;
}

export function placeCard(state: GameState, cardId: string, position: { x: number; y: number }): GameState {
  const newState = JSON.parse(JSON.stringify(state));
  const player = newState.players[newState.currentPlayerIndex];

  // Setup fázis kezelése
  if (newState.phase === 'setup') {
    const cardIndex = player.hand.findIndex((c: Card) => c.id === cardId);
    if (cardIndex === -1) return state;
    
    const card = player.hand[cardIndex];
    // Setupnál mindig REJTETTEN rakjuk le
    const cardToPlace = { ...card, isHidden: true };
    
    newState.board[position.y][position.x] = cardToPlace;
    player.hand.splice(cardIndex, 1);
    newState.logs.push(`${player.name} lerakott egy kártyát a pályaépítéshez.`);

    // Következő játékos
    newState.currentPlayerIndex = (newState.currentPlayerIndex + 1) % newState.players.length;

    // Ha mindenki lerakta az összes lapját (vagy elfogyott a kéz), jöhet a bábu lerakás
    const allHandsEmpty = newState.players.every((p: Player) => p.hand.length === 0);
    if (allHandsEmpty) {
      newState.phase = 'setup_token';
      newState.logs.push("Pálya kész! Helyezzétek el a bábukat.");
    }
    return newState;
  }

  // Normál játék lerakás
  const cardIndex = player.hand.findIndex((c: Card) => c.id === cardId);
  if (cardIndex === -1) return state;

  const card = player.hand[cardIndex];
  
  // Ellenőrzés: üres-e a mező
  if (newState.board[position.y][position.x] !== null) return state;
  
  // Ellenőrzés: nincs-e ott játékos
  if (newState.players.some((p: Player) => p.position?.x === position.x && p.position?.y === position.y)) return state;

  // Lerakás szabály:
  // Ha a most húzott kártyát rakja le -> REJTETT (isHidden = true)
  // Ha régebbi kártyát rak le -> NYÍLT (isHidden = false)
  const isJustDrawn = card.id === newState.lastDrawnCardId;
  
  const cardToPlace = { ...card, isHidden: isJustDrawn };

  newState.board[position.y][position.x] = cardToPlace;
  player.hand.splice(cardIndex, 1);
  
  if (isJustDrawn) {
    newState.logs.push(`${player.name} lerakott egy REJTETT kártyát (talonból).`);
  } else {
    newState.logs.push(`${player.name} lerakott egy NYÍLT kártyát (kézből).`);
  }

  // Fázis kezelés a lerakás után
  if (newState.phase === 'place_after_move') {
    // Ha mozgás utáni kényszerlerakás volt, akkor most jön a húzás
    newState.phase = 'draw';
    // Nem váltunk játékost!
  } else {
    // 'place' vagy 'place_after_draw' esetén vége a körnek
    newState.currentPlayerIndex = (newState.currentPlayerIndex + 1) % newState.players.length;
    newState.phase = 'move';
    newState.turnCount++;
    newState.lastDrawnCardId = null;
  }

  return newState;
}

export function placeToken(state: GameState, position: { x: number; y: number }): GameState {
  const newState = JSON.parse(JSON.stringify(state));
  const player = newState.players[newState.currentPlayerIndex];

  // Csak setup_token fázisban
  if (newState.phase !== 'setup_token') return state;

  // Csak üres helyre (nincs kártya, nincs bábu)
  if (newState.board[position.y][position.x] !== null) return state;
  if (newState.players.some((p: Player) => p.position?.x === position.x && p.position?.y === position.y)) return state;

  player.position = position;
  newState.logs.push(`${player.name} felhelyezte a bábuját.`);

  // Következő játékos
  newState.currentPlayerIndex = (newState.currentPlayerIndex + 1) % newState.players.length;

  // Ha mindenki lerakta a bábuját, indul a játék
  const allTokensPlaced = newState.players.every((p: Player) => p.position !== null);
  if (allTokensPlaced) {
    newState.phase = 'move';
    newState.logs.push("Minden bábu a helyén. Kezdődik a mozgás!");
  }

  return newState;
}

export function passTurn(state: GameState): GameState {
  const newState = JSON.parse(JSON.stringify(state));
  const player = newState.players[newState.currentPlayerIndex];

  // Csak 'place' fázisban lehet passzolni
  if (newState.phase !== 'place') return state;
  
  // Csak akkor passzolhat, ha 5 vagy kevesebb lapja van
  if (player.hand.length > 5) return state;

  newState.logs.push(`${player.name} passzolt (nem rakott le lapot).`);
  
  // Következő játékos
  newState.currentPlayerIndex = (newState.currentPlayerIndex + 1) % newState.players.length;
  newState.phase = 'move';
  newState.turnCount++;
  newState.lastDrawnCardId = null;

  return newState;
}
