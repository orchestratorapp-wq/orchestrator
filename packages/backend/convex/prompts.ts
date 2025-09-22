import { v } from "convex/values";
import { api } from "./_generated/api";
import { internalQuery, mutation, query } from "./_generated/server";

export const list = query({
	args: {},
	handler: async (ctx) => {
		const user = await ctx.runQuery(api.auth.loggedInUser);

		if (user?.role !== "admin") {
			return [];
		}

		return ctx.db.query("prompts").order("desc").collect();
	},
});

export const get = query({
	args: { promptId: v.id("prompts") },
	handler: async (ctx, args) => {
		const user = await ctx.runQuery(api.auth.loggedInUser);

		if (user?.role !== "admin") {
			return null;
		}

		const prompt = await ctx.db.get(args.promptId);

		return prompt;
	},
});

export const create = mutation({
	args: {
		content: v.string(),
		weight: v.number(),
		model: v.union(v.literal("gpt-5"), v.literal("gpt-5-nano"), v.string()),
		type: v.optional(v.string()),
		subType: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const user = await ctx.runQuery(api.auth.loggedInUser);

		if (user?.role !== "admin") {
			return null;
		}

		return await ctx.db.insert("prompts", {
			content: args.content,
			type: args.type,
			weight: args.weight,
			model: args.model,
			subType: args.subType,
		});
	},
});

export const update = mutation({
	args: {
		promptId: v.id("prompts"),
		content: v.string(),
		weight: v.number(),
		model: v.union(v.literal("gpt-5"), v.literal("gpt-5-nano"), v.string()),
		type: v.optional(v.string()),
		subType: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const user = await ctx.runQuery(api.auth.loggedInUser);

		if (user?.role !== "admin") {
			return null;
		}

		const prompt = await ctx.db.get(args.promptId);
		if (!prompt) {
			throw new Error("Prompt not found");
		}

		return ctx.db.patch(args.promptId, {
			content: args.content,
			model: args.model,
			weight: args.weight,
			type: args.type,
			subType: args.subType,
		});
	},
});

export const remove = mutation({
	args: { promptId: v.id("prompts") },
	handler: async (ctx, args) => {
		const user = await ctx.runQuery(api.auth.loggedInUser);

		if (user?.role !== "admin") {
			return null;
		}

		return ctx.db.delete(args.promptId);
	},
});

export const getSystemPrompts = internalQuery({
	args: {},
	handler: async (ctx) => {
		const publicPrompts = await ctx.db
			.query("prompts")
			.withIndex("by_sub_type", (q) => q.eq("subType", "system"))
			.collect();

		return publicPrompts.sort((a, b) => b.weight - a.weight);
	},
});
