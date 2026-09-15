import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { GameView } from './types';

const mocks = vi.hoisted(() => ({ useLobby: vi.fn() }));
vi.mock('./useLobby', () => ({ useLobby: mocks.useLobby }));

function gameView(overrides: Partial<GameView> = {}): GameView {
  return {
    code: 'AB12C', hostId: 'one', phase: 'Playing',
    settings: { impostorCount: 1, extraImpostorChancePercent: 0, roundCount: 3, turnSeconds: 30 },
    players: [
      { id: 'one', nickname: 'Alex', isHost: true, hasVoted: false, isImpostor: null, voteCount: null },
      { id: 'two', nickname: 'Sam', isHost: false, hasVoted: false, isImpostor: null, voteCount: null },
      { id: 'three', nickname: 'Robin', isHost: false, hasVoted: false, isImpostor: null, voteCount: null },
    ],
    self: { id: 'one', isImpostor: false, word: 'Pineapple', hasVoted: false },
    roundNumber: 1, turnNumber: 7, currentPlayerId: 'one',
    turnEndsAt: new Date(Date.now() + 30_000).toISOString(), serverTime: new Date().toISOString(),
    votesCast: 0, isVoteTie: false, guessesRemaining: 1, guesses: [], revealedWord: null, winningTeam: null, version: 7,
    ...overrides,
  };
}

function lobbyState(view: GameView | null = null) {
  return {
    session: view ? { code: view.code, playerId: 'one', token: 'private-token' } : null,
    view, serverOffset: 0, busy: false, error: null, connectionError: null,
    connect: vi.fn().mockResolvedValue(undefined), mutate: vi.fn().mockResolvedValue(true), clearError: vi.fn(),
  };
}

beforeEach(() => mocks.useLobby.mockReturnValue(lobbyState()));
afterEach(cleanup);

describe('Joining a game', () => {
  it('requires a nonblank nickname before either lobby action', () => {
    render(<App />);
    const create = screen.getByRole('button', { name: 'Create a lobby' });
    const join = screen.getByRole('button', { name: 'Join lobby' });
    fireEvent.change(screen.getByLabelText('Five-character lobby code'), { target: { value: 'AB12C' } });
    expect(create).toBeDisabled();
    expect(join).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Your nickname'), { target: { value: '   ' } });
    expect(create).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Your nickname'), { target: { value: 'Alex' } });
    expect(create).toBeEnabled();
    expect(join).toBeEnabled();
  });

  it('normalizes a shared lobby code and submits the nickname', () => {
    const state = lobbyState();
    mocks.useLobby.mockReturnValue(state);
    render(<App />);
    fireEvent.change(screen.getByLabelText('Your nickname'), { target: { value: 'Alex' } });
    fireEvent.change(screen.getByLabelText('Five-character lobby code'), { target: { value: 'a b-12c' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join lobby' }));
    expect(state.connect).toHaveBeenCalledWith('Alex', 'AB12C');
  });
});

describe('Private game interactions', () => {
  it('hides the private word until requested, and hides it again for a rematch', () => {
    mocks.useLobby.mockReturnValue(lobbyState(gameView()));
    const rendered = render(<App />);
    expect(screen.queryByText('Pineapple')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal my secret' }));
    expect(screen.getByText('Pineapple')).toBeVisible();
    mocks.useLobby.mockReturnValue(lobbyState(gameView({ phase: 'Lobby' })));
    rendered.rerender(<App />);
    mocks.useLobby.mockReturnValue(lobbyState(gameView()));
    rendered.rerender(<App />);
    expect(screen.queryByText('Pineapple')).not.toBeInTheDocument();
  });

  it('binds a turn confirmation to the server turn number', () => {
    const state = lobbyState(gameView());
    mocks.useLobby.mockReturnValue(state);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: "I've said my clue" }));
    expect(state.mutate).toHaveBeenCalledWith('/turn', { turnNumber: 7 });
  });

  it('only offers confirmation to the player whose turn it is', () => {
    mocks.useLobby.mockReturnValue(lobbyState(gameView({ currentPlayerId: 'two' })));
    render(<App />);
    expect(screen.queryByRole('button', { name: "I've said my clue" })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sam is up.' })).toBeVisible();
  });

  it('excludes self-votes and locks in the selected other player', () => {
    const state = lobbyState(gameView({ phase: 'Voting' }));
    mocks.useLobby.mockReturnValue(state);
    render(<App />);
    expect(screen.queryByRole('button', { name: 'Alex' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lock in my vote' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Robin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lock in my vote' }));
    expect(state.mutate).toHaveBeenCalledWith('/votes', { targetId: 'three' });
  });

  it('only presents the guess form to impostors', () => {
    mocks.useLobby.mockReturnValue(lobbyState(gameView({ phase: 'Guessing' })));
    const rendered = render(<App />);
    expect(screen.queryByLabelText('Your guess')).not.toBeInTheDocument();
    mocks.useLobby.mockReturnValue(lobbyState(gameView({ phase: 'Guessing', self: { id: 'one', isImpostor: true, word: 'Tropical', hasVoted: true }, isVoteTie: true, guessesRemaining: 3 })));
    rendered.rerender(<App />);
    expect(screen.getByLabelText('Your guess')).toBeVisible();
    expect(screen.getByText('3 guesses remaining')).toBeVisible();
  });
});
