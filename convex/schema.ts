import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { List } from "immutable";

export const vColor = v.union(
  v.literal('blue'),
  v.literal('green'),
  v.literal('red'),
  v.literal('white'),
  v.literal('yellow'),
);
export type Color = typeof vColor.type;
export const COLORS: List<Color> = List(['blue', 'green', 'red', 'white', 'yellow']);

export const vRank = v.union(
  v.literal(1),
  v.literal(2),
  v.literal(3),
  v.literal(4),
  v.literal(5),
);
export type Rank = typeof vRank.type;
export const RANKS: List<Rank> = List([1, 2, 3, 4, 5]);

export const vCard = v.object({ color: vColor, rank: vRank });
export type Card = typeof vCard.type;

export const vHandPosn = v.union(
  v.literal('left'),
  v.literal('midleft'),
  v.literal('center'),
  v.literal('midright'),
  v.literal('right'),
);
export type HandPosn = typeof vHandPosn.type;
export const HAND_POSNS_4: List<HandPosn> = List(['left', 'midleft', 'midright', 'right']);
export const HAND_POSNS_5: List<HandPosn> = List(['left', 'midleft', 'center', 'midright', 'right']);

export const vAction = v.union(
  v.object({ type: v.literal('discard'), posn: vHandPosn }),
  v.object({ type: v.literal('play'), posn: vHandPosn }),
  v.object({ type: v.literal('hintColor'), targetName: v.string(), color: vColor }),
  v.object({ type: v.literal('hintRank'), targetName: v.string(), rank: vRank }),
);
export type Action = typeof vAction.type;

export const vPlayer = v.object({
  name: v.string(),
  hand: v.object({
    'left': v.optional(vCard),
    'midleft': v.optional(vCard),
    'center': v.optional(vCard),
    'midright': v.optional(vCard),
    'right': v.optional(vCard),
  }),
})
export type Player = typeof vPlayer.type;

export const vGameState = v.object({
  players: v.array(vPlayer),
  deck: v.array(v.object({ color: vColor, rank: vRank })),
  nHints: v.number(),
  nStrikes: v.number(),
  towers: v.object({
    'blue': v.optional(vRank),
    'green': v.optional(vRank),
    'red': v.optional(vRank),
    'white': v.optional(vRank),
    'yellow': v.optional(vRank),
  }),
  movesLeft: v.optional(v.number()),
});
export type GameState = typeof vGameState.type;

export default defineSchema({
  games: defineTable({
    initState: vGameState,
  }),

  actions: defineTable({
    game: v.id("games"),
    data: vAction,
  })
    .index("by_game", ["game"])
  ,
});
