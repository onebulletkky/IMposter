import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { languageStorageKey, translateError } from './i18n';
import type { GameView, Phase } from './types';

const mocks = vi.hoisted(() => ({ useLobby: vi.fn() }));
vi.mock('./useLobby', () => ({ useLobby: mocks.useLobby }));

function view(phase: Phase): GameView {
  return {
    code: 'AB12C', hostId: 'one', phase,
    settings: { impostorCount: 1, extraImpostorChancePercent: 0, roundCount: 3, turnSeconds: 30 },
    players: [
      { id: 'one', nickname: 'Alex', isHost: true, hasVoted: true, isImpostor: true, voteCount: 1 },
      { id: 'two', nickname: 'Sam', isHost: false, hasVoted: false, isImpostor: false, voteCount: 2 },
      { id: 'three', nickname: 'Robin', isHost: false, hasVoted: false, isImpostor: false, voteCount: 0 },
    ],
    self: { id: 'one', isImpostor: true, word: 'Tropical', hasVoted: false },
    roundNumber: 1, turnNumber: 4, currentPlayerId: 'one',
    turnEndsAt: new Date(Date.now() + 30_000).toISOString(), serverTime: new Date().toISOString(),
    votesCast: 1, isVoteTie: true, guessesRemaining: 3,
    guesses: [{ playerId: 'one', word: 'Mango', isCorrect: false }],
    revealedWord: phase === 'Finished' ? 'Pineapple' : null,
    winningTeam: phase === 'Finished' ? 'Crew' : null, version: 7,
  };
}

function state(game: GameView | null = null) {
  return {
    session: game ? { code: game.code, playerId: 'one', token: 'private-token' } : null,
    view: game, serverOffset: 0, busy: false, error: null as string | null, connectionError: null,
    connect: vi.fn().mockResolvedValue(undefined), mutate: vi.fn().mockResolvedValue(true), clearError: vi.fn(),
  };
}

function selectLanguage(language: 'English' | 'Italiano') {
  fireEvent.mouseDown(screen.getByRole('combobox'));
  fireEvent.click(screen.getByRole('option', { name: language }));
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
  mocks.useLobby.mockReturnValue(state());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('Language preference', () => {
  it('switches the full entrance and rules while preserving a nickname and lobby code', async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Your nickname'), { target: { value: 'Alex' } });
    fireEvent.change(screen.getByLabelText('Five-character lobby code'), { target: { value: 'AB12C' } });
    selectLanguage('Italiano');
    expect(screen.getByRole('combobox', { name: 'Lingua' })).toBeVisible();
    expect(screen.getByLabelText('Il tuo soprannome')).toHaveValue('Alex');
    expect(screen.getByLabelText('Codice della stanza di cinque caratteri')).toHaveValue('AB12C');
    expect(screen.getByRole('button', { name: 'Crea una stanza' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Entra nella stanza' })).toBeEnabled();
    expect(document.documentElement.lang).toBe('it');
    expect(document.title).toBe('Impostor - Fidati del tuo istinto');
    fireEvent.click(screen.getByRole('button', { name: 'Come si gioca' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Una parola. Tanti sospetti.');
    expect(screen.getByRole('dialog')).toHaveTextContent('Raduna i tuoi amici');
    fireEvent.click(screen.getByRole('button', { name: 'Ho capito' }));
    await screen.findByRole('combobox');
    selectLanguage('English');
    expect(screen.getByLabelText('Your nickname')).toHaveValue('Alex');
    expect(document.documentElement.lang).toBe('en');
  });

  it('restores the saved selection after reopening the application', () => {
    const first = render(<App />);
    selectLanguage('Italiano');
    expect(localStorage.getItem(languageStorageKey)).toBe('it');
    first.unmount();
    render(<App />);
    expect(screen.getByRole('button', { name: 'Crea una stanza' })).toBeVisible();
  });

  it('uses an Italian browser preference when no selection has been saved', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['it-IT', 'en-US']);
    render(<App />);
    expect(screen.getByRole('button', { name: 'Crea una stanza' })).toBeVisible();
  });

  it('honors a saved English selection over the Italian browser default', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['it-IT']);
    localStorage.setItem(languageStorageKey, 'en');
    render(<App />);
    expect(screen.getByRole('button', { name: 'Create a lobby' })).toBeVisible();
  });

  it('supports language switching when browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
    render(<App />);
    selectLanguage('Italiano');
    expect(screen.getByRole('button', { name: 'Crea una stanza' })).toBeVisible();
  });
});

describe('Italian game screens', () => {
  it.each([
    ['Lobby', 'Personalizza la partita'],
    ['Playing', 'Tocca a te.'],
    ['Voting', 'Chi \u00e8 l\u0027impostore?'],
    ['Guessing', 'Indovina la parola segreta.'],
    ['Finished', 'Vince il gruppo.'],
  ] as const)('translates the %s page without translating shared game content', (phase, heading) => {
    localStorage.setItem(languageStorageKey, 'it');
    mocks.useLobby.mockReturnValue(state(view(phase)));
    render(<App />);
    expect(screen.getByRole('heading', { name: heading })).toBeVisible();
    expect(screen.getByText('AB12C')).toBeVisible();
    expect(screen.getAllByText('Sam')[0]).toBeVisible();
    if (phase === 'Lobby') {
      expect(screen.getByLabelText('Probabilit\u00e0 di un impostore extra (%)')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Inizia partita' })).toBeVisible();
    }
    if (phase === 'Playing') {
      expect(screen.getByText('Giro 1 di 3')).toBeVisible();
      expect(screen.getByRole('timer')).toHaveAccessibleName(/secondi rimasti/);
      expect(screen.queryByText('Tropical')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Mostra il mio segreto' }));
      expect(screen.getByText('Tropical')).toBeVisible();
      selectLanguage('English');
      expect(screen.getByText('Tropical')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Hide my secret' })).toBeVisible();
    }
    if (phase === 'Voting') expect(screen.getByLabelText('Alex ha votato')).toBeVisible();
    if (phase === 'Guessing') {
      expect(screen.getByText('3 tentativi rimasti')).toBeVisible();
      expect(screen.getByText('1 voto')).toBeVisible();
      expect(screen.getByText('2 voti')).toBeVisible();
      expect(screen.getByText('Mango')).toBeVisible();
      expect(screen.getByText('Errato')).toBeVisible();
    }
    if (phase === 'Finished') expect(screen.getByText('Pineapple')).toBeVisible();
  });

  it('translates an existing error immediately when the language changes', () => {
    const lobby = state();
    lobby.error = 'That nickname is already in use in this lobby.';
    mocks.useLobby.mockReturnValue(lobby);
    render(<App />);
    expect(screen.getByRole('alert')).toHaveTextContent(lobby.error);
    selectLanguage('Italiano');
    expect(screen.getByRole('alert')).toHaveTextContent('Questo soprannome \u00e8 gi\u00e0 in uso nella stanza.');
    expect(screen.getByRole('button', { name: 'Chiudi' })).toBeVisible();
  });

  it('translates parameterized validation and unfamiliar server failures', () => {
    expect(translateError('it', 'A game needs between 3 and 16 players.')).toBe('Una partita richiede da 3 a 16 giocatori.');
    expect(translateError('it', 'This action is only available during voting.')).toBe('Questa azione \u00e8 disponibile solo durante il voto.');
    expect(translateError('it', 'A future server error.')).toBe('Impossibile completare la richiesta.');
  });
});

describe('Localized sleep controls', () => {
  it('offers an Italian resume action and disables game actions while paused', () => {
    localStorage.setItem(languageStorageKey, 'it');
    const lobby = {
      ...state(view('Lobby')),
      pollingPaused: true, refreshing: false, resumePolling: vi.fn(),
    };
    mocks.useLobby.mockReturnValue(lobby);
    render(<App />);
    expect(screen.getByRole('alert')).toHaveTextContent('Gli aggiornamenti sono stati sospesi durante la tua assenza.');
    expect(screen.getByRole('button', { name: 'Inizia partita' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Riprendi aggiornamenti' }));
    expect(lobby.resumePolling).toHaveBeenCalledOnce();
  });

  it('disables a stale turn until the resumed lobby snapshot arrives', () => {
    const lobby = {
      ...state(view('Playing')),
      pollingPaused: false, refreshing: true, resumePolling: vi.fn(),
    };
    mocks.useLobby.mockReturnValue(lobby);
    const rendered = render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent('Catching up with your lobby...');
    expect(screen.getByRole('button', { name: "I've said my clue" })).toBeDisabled();
    mocks.useLobby.mockReturnValue({ ...lobby, refreshing: false });
    rendered.rerender(<App />);
    expect(screen.getByRole('button', { name: "I've said my clue" })).toBeEnabled();
  });
});
