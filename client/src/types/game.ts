export type PlayerColor = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange' | 'cyan' | 'magenta';

export interface Player {
  id: number;
  name: string;
  color: PlayerColor;
  score: number;
  hand: Card[];
  chains: Chain[];
  position: { x: number; y: number } | null;
  isEliminated: boolean;
}

export type CardType = 'SZEMÉLY' | 'HELYSZÍN' | 'ESEMÉNY' | 'IDŐPONT';

export interface Card {
  id: string;
  type: CardType;
  title: string;
  description: string;
  chain: string;
  year?: number;
  imageUrl?: string;
  isHidden?: boolean; // Ha true, akkor a táblán lefordítva jelenik meg
}

export interface Chain {
  id: string;
  cards: Card[];
  isValid: boolean;
  isRejected: boolean;
  points: number;
}

export interface GameState {
  players: Player[];
  currentPlayerIndex: number;
  board: (Card | null)[][]; // 10x10 grid, null means empty, Card means card on board
  deck: Card[];
  discards: Card[];
  turnCount: number;
  phase: 'setup' | 'setup_token' | 'move' | 'place_after_move' | 'draw' | 'place_after_draw' | 'place' | 'end';
  lastDrawnCardId: string | null; // Az aktuális körben húzott kártya ID-ja
  timeLeft: number; // in seconds
  isGameOver: boolean;
  winnerId: number | null;
  settings: {
    playerCount: number;
    timeLimitMinutes: number;
    mode: 'light' | 'advanced';
  };
  logs: string[];
}

export interface Move {
  from: { x: number; y: number };
  to: { x: number; y: number };
}
