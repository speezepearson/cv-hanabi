import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { gameStateToRaw, randGame } from "../hanabi";
import { List } from "immutable";
import { vAction } from "./schema";

export const create = mutation({
  args: { players: v.array(v.string()) },
  handler: async (ctx, args) => {
    const g = randGame(List(args.players));
    return await ctx.db.insert("games", { initState: gameStateToRaw(g) });
  },
});

export const get = query({
  args: { id: v.id("games") },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.id);
    if (game === null) throw new Error("Game not found");
    return {
      init: game,
      actions: await ctx.db.query("actions").withIndex('by_game', q => q.eq('game', args.id)).collect(),
    }
  },
});

export const act = mutation({
  args: { game: v.id("games"), action: vAction },
  handler: async (ctx, args) => {
    return await ctx.db.insert("actions", { game: args.game, data: args.action });
  },
});
