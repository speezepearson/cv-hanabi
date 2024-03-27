import { List, Map } from 'immutable'
import { Action, COLORS, Card, Color, HAND_POSNS_4, HAND_POSNS_5, HandPosn, Rank, GameState as RawGameState } from './convex/schema'

export type Hand = Map<HandPosn, Readonly<Card>>;

export type GameState = Readonly<{
  players: List<Readonly<{ name: string, hand: Map<HandPosn, Readonly<Card>> }>>,
  deck: List<Readonly<{ color: Color, rank: Rank }>>,
  nHints: number,
  nStrikes: number,
  towers: Map<Color, Rank>,
  movesLeft?: number,
}>

export const gameStateFromRaw = (raw: RawGameState): GameState => ({
  players: List(raw.players).map(p => ({ name: p.name, hand: Map(p.hand as Record<HandPosn, { color: Color, rank: Rank }>) })),
  deck: List(raw.deck),
  nHints: raw.nHints,
  nStrikes: raw.nStrikes,
  towers: Map(raw.towers as Record<Color, Rank>),
});
export const gameStateToRaw = (g: GameState): RawGameState => ({
  players: g.players.map(p => ({ name: p.name, hand: p.hand.toObject() })).toArray(),
  deck: g.deck.toArray(),
  nHints: g.nHints,
  nStrikes: g.nStrikes,
  towers: g.towers.toObject(),
});

const multiplicities: List<Rank> = List([1, 1, 1, 2, 2, 3, 3, 4, 4, 5]);

export const incr = (x: Rank): Rank | null => {
  switch (x) {
    case 1: return 2;
    case 2: return 3;
    case 3: return 4;
    case 4: return 5;
    case 5: return null;
  }
  throw new Error('Invalid rank');
}

const cyclePlayers = (g: GameState): GameState => {
  return { ...g, players: g.players.skip(1).push(g.players.first()) };
}

export const randGame = (playerNames: List<string>): GameState => {
  const handPosns = playerNames.size >= 4 ? HAND_POSNS_4 : HAND_POSNS_5;
  let deck: List<Card> = List(
    COLORS.flatMap(color => multiplicities.map(rank => ({ color, rank })))
  ).sortBy(() => Math.random());
  let players: GameState['players'] = List();
  for (const name of playerNames) {
    players = players.push({ name, hand: handPosns.zip(deck).reduce((hand, [posn, card]) => hand.set(posn, card), Map<HandPosn, Card>()) });
    deck = deck.skip(handPosns.size);
  }
  return {
    deck,
    players,
    nHints: 8,
    nStrikes: 0,
    towers: Map(),
  };
}

export const step = (g: GameState, action: Action): GameState => {
  switch (action.type) {
    case 'discard':
      return discard(g, action.posn);
    case 'play':
      return play(g, action.posn);
    case 'hintColor':
      return hint(g);
    case 'hintRank':
      return hint(g);
  }
}

const discard = (g: GameState, posn: HandPosn): GameState => {
  return cyclePlayers({
    ...g,
    nHints: Math.min(8, g.nHints + 1),
    deck: g.deck.skip(1),
    players: g.players.update(0, player => ({
      ...player!,
      hand: g.deck.isEmpty() ? player!.hand.remove(posn) : player!.hand.set(posn, g.deck.first()),
    })),
    movesLeft: g.movesLeft !== undefined ? g.movesLeft - 1 : g.deck.size === 1 ? g.players.size : undefined,
  });
}

const play = (g: GameState, posn: HandPosn): GameState => {
  const playedCard = g.players.first()!.hand.get(posn);
  if (!playedCard) throw new Error('Cannot play a null card');
  const tower = g.towers.get(playedCard.color);
  const isSuccess = tower ? incr(tower) === playedCard.rank : playedCard.rank === 1;
  let result = g;
  if (isSuccess) {
    result = { ...result, towers: result.towers.set(playedCard.color, playedCard.rank) };
    if (playedCard.rank === 5) {
      result = { ...result, nHints: Math.min(8, result.nHints + 1) };
    }
  } else {
    result = { ...result, nStrikes: result.nStrikes + 1 };
  }
  return cyclePlayers({
    ...result,
    deck: g.deck.skip(1),
    players: g.players.update(0, player => ({
      ...player!,
      hand: g.deck.isEmpty() ? player!.hand.remove(posn) : player!.hand.set(posn, g.deck.first()),
    })),
    movesLeft: g.movesLeft !== undefined ? g.movesLeft - 1 : g.deck.size === 1 ? g.players.size : undefined,
  })
}

const hint = (g: GameState): GameState => {
  if (g.nHints < 1) throw new Error('No hints left');
  return cyclePlayers({
    ...g,
    nHints: g.nHints - 1,
    movesLeft: g.movesLeft !== undefined ? g.movesLeft - 1 : undefined,
  });
}

export const getGameStatus = (g: GameState): { type: 'playing' } | { type: 'over', score: number } | { type: 'lost' } => {
  if (g.nStrikes >= 4) return { type: 'lost' };
  if (g.movesLeft === 0) return { type: 'over', score: g.towers.reduce((score, rank) => score + rank, 0) };
  return { type: 'playing' };
};
