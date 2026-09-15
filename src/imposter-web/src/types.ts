export type Phase = 'Lobby' | 'Playing' | 'Voting' | 'Guessing' | 'Finished';

export interface GameSettings {
  impostorCount: number;
  extraImpostorChancePercent: number;
  roundCount: number;
  turnSeconds: number;
}

export interface Player {
  id: string;
  nickname: string;
  isHost: boolean;
  hasVoted: boolean;
  isImpostor: boolean | null;
  voteCount: number | null;
}

export interface GameView {
  code: string;
  hostId: string;
  phase: Phase;
  settings: GameSettings;
  players: Player[];
  self: { id: string; isImpostor: boolean | null; word: string | null; hasVoted: boolean };
  roundNumber: number;
  turnNumber: number;
  currentPlayerId: string | null;
  turnEndsAt: string | null;
  serverTime: string;
  votesCast: number;
  isVoteTie: boolean;
  guessesRemaining: number;
  guesses: { playerId: string; word: string; isCorrect: boolean }[];
  revealedWord: string | null;
  winningTeam: 'Impostors' | 'Crew' | null;
  version: number;
}

export interface Session {
  code: string;
  playerId: string;
  token: string;
}

export interface JoinResponse extends Session {
  view: GameView;
}
