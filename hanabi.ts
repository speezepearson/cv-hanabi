import { List, Map, Record } from 'immutable'

enum Color {
  Blue = 'Blue',
  Green = 'Green',
  Red = 'Red',
  White = 'White',
  Yellow = 'Yellow',
}

enum Number {
  One = 1,
  Two = 2,
  Three = 3,
  Four = 4,
  Five = 5,
}

const multiplicities: Map<Number, number> = Map({
  [Number.One]: 3,
  [Number.Two]: 2,
  [Number.Three]: 2,
  [Number.Four]: 2,
  [Number.Five]: 1,
});

export const incr = (x: Number): Number | null => {
  switch (x) {
    case Number.One: return Number.Two;
    case Number.Two: return Number.Three;
    case Number.Three: return Number.Four;
    case Number.Four: return Number.Five;
    case Number.Five: return null;
  }
}

export type Card = {
  color: Color;
  number: Number;
}

interface IPlayer {
  name: string
  hand: List<Card | null>;
}

const RPlayer = Record<IPlayer>({
  name: '',
  hand: List()
});

class Player extends RPlayer {
  constructor(props: IPlayer) {
    super(props);
  }
}


// Define the game state structure
interface IGameState {
  deck: List<Card>;
  players: List<Player>;
  nHints: number;
  strikeTokens: number;
  towers: Map<Color, Number>;
}

const RGameState = Record<IGameState>({
  deck: List(),
  players: List(),
  nHints: 8,
  strikeTokens: 0,
  towers: Map(),
});

class GameState extends RGameState {
  constructor(props: IGameState) {
    super(props);
  }

  private cyclePlayers(): GameState {
    return this.update('players', players => players.push(players.first()));
  }

  static rand(playerNames: List<string>): GameState {
    let deck: List<Card> = List([
      ...Object.keys(Color).flatMap(cName => Object.keys(Number).flatMap(nName => Array(multiplicities.get(Number[nName])!).fill({ color: Color[cName], number: Number[nName] }))),
    ]).sortBy(() => Math.random());
    let players = List<Player>();
    for (const name of playerNames) {
      players = players.push(new Player({ name, hand: deck.take(5) }));
      deck = deck.skip(5);
    }
    return new GameState({
      deck,
      players,
      nHints: 8,
      strikeTokens: 0,
      towers: Map(),
    });
  }

  step(action: Action): GameState {
    switch (action.type) {
      case 'discard':
        return this.discard(action.index);
      case 'play':
        return this.play(action.index);
      case 'hint':
        return this.hint(action);
    }
  }

  discard(index: number): GameState {
    return this
      .set('nHints', Math.min(8, this.nHints + 1))
      .set('deck', this.deck.skip(1))
      .set('players', this.players.update(0, player => player!.update('hand', hand => hand.set(index, this.deck.first() || null))))
      .cyclePlayers();
  }

  play(index: number): GameState {
    const playedCard = this.players.first()!.hand.get(index);
    if (!playedCard) throw new Error('Cannot play a null card');
    const tower = this.towers.get(playedCard.color);
    const isSuccess = tower ? incr(tower) === playedCard.number : playedCard.number === Number.One;
    let result = this;
    if (isSuccess) {
      result = result.set('towers', result.towers.set(playedCard.color, playedCard.number));
      if (playedCard.number === Number.Five) {
        result = result.set('nHints', Math.min(8, result.nHints + 1));
      }
    } else {
      result = result.set('strikeTokens', result.strikeTokens + 1);
    }
    return result
      .set('deck', this.deck.skip(1))
      .set('players', this.players.update(0, player => player!.update('hand', hand => hand.set(index, this.deck.first() || null))))
      .cyclePlayers();
  }

  hint(action: Action & { type: 'hint' }): GameState {
    if (this.nHints < 1) throw new Error('No hints left');
    return this
      .set('nHints', this.nHints - 1)
      .cyclePlayers();
  }
}

export type Action =
  | { type: 'discard', index: number }
  | { type: 'play', index: number }
  | { type: 'hint', player: Player, hintType: 'color', color: Color }
  | { type: 'hint', player: Player, hintType: 'number', number: Number }

export type IHistory = {
  start: GameState;
  actions: List<Action>;
}

const RHistory = Record<IHistory>({
  start: GameState.rand(List(['Alice', 'Bob'])),
  actions: List(),
});

export class History extends RHistory {
  constructor(props: IHistory) {
    super(props);
  }

  step(action: Action): History {
    return this.update('actions', actions => actions.push(action));
  }
}
