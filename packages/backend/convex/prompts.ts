import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
	internalQuery,
	type MutationCtx,
	mutation,
	type QueryCtx,
	query,
} from "./_generated/server";

// Helper function to check if user is admin

async function isAdmin(
	ctx: QueryCtx | MutationCtx,
	userId: Id<"users">,
): Promise<boolean> {
	const userRole = await ctx.db
		.query("userRoles")
		.withIndex("by_user", (q) => q.eq("userId", userId))
		.first();

	return userRole?.role === "admin";
}

export const checkAdmin = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			return false;
		}
		return await isAdmin(ctx, userId);
	},
});

export const makeAdmin = mutation({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new Error("Not authenticated");
		}

		// Check if user already has a role
		const existingRole = await ctx.db
			.query("userRoles")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.first();

		if (existingRole) {
			return existingRole;
		}

		// Make first user admin, others regular users
		const userCount = await ctx.db.query("userRoles").collect();
		const role = userCount.length === 0 ? "admin" : "user";

		return await ctx.db.insert("userRoles", {
			userId,
			role,
		});
	},
});

export const list = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new Error("Authentication required");
		}

		const userIsAdmin = await isAdmin(ctx, userId);

		if (userIsAdmin) {
			// Admins can see all prompts
			return await ctx.db.query("prompts").order("desc").collect();
		}

		// Regular users see their own prompts + public prompts
		const userPrompts = await ctx.db
			.query("prompts")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.order("desc")
			.collect();

		const publicPrompts = await ctx.db
			.query("prompts")
			.withIndex("by_public", (q) => q.eq("isPublic", true))
			.order("desc")
			.collect();

		// Combine and deduplicate
		const allPrompts = [...userPrompts];
		for (const prompt of publicPrompts) {
			if (!allPrompts.find((p) => p._id === prompt._id)) {
				allPrompts.push(prompt);
			}
		}

		return allPrompts.sort((a, b) => b._creationTime - a._creationTime);
	},
});

export const get = query({
	args: { promptId: v.id("prompts") },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new Error("Authentication required");
		}

		const prompt = await ctx.db.get(args.promptId);

		if (!prompt) {
			return null;
		}

		// Allow access to public prompts or own prompts
		if (prompt.isPublic || prompt.userId === userId) {
			return prompt;
		}

		// Admins can access all prompts
		if (await isAdmin(ctx, userId)) {
			return prompt;
		}

		return null;
	},
});

export const create = mutation({
	args: {
		name: v.string(),
		content: v.string(),
		type: v.optional(v.string()),
		subType: v.optional(v.string()),
		isPublic: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new Error("Must be logged in to create prompts");
		}

		const userIsAdmin = await isAdmin(ctx, userId);
		if (!userIsAdmin) {
			throw new Error("Only admins can create prompts");
		}

		return await ctx.db.insert("prompts", {
			name: args.name,
			content: args.content,
			type: args.type,
			subType: args.subType,
			userId,
			isPublic: args.isPublic || false,
		});
	},
});

export const update = mutation({
	args: {
		promptId: v.id("prompts"),
		name: v.string(),
		content: v.string(),
		type: v.optional(v.string()),
		subType: v.optional(v.string()),
		isPublic: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new Error("Not authenticated");
		}

		const userIsAdmin = await isAdmin(ctx, userId);
		if (!userIsAdmin) {
			throw new Error("Only admins can edit prompts");
		}

		const prompt = await ctx.db.get(args.promptId);
		if (!prompt) {
			throw new Error("Prompt not found");
		}

		await ctx.db.patch(args.promptId, {
			name: args.name,
			content: args.content,
			type: args.type,
			subType: args.subType,
			isPublic: args.isPublic,
		});
	},
});

export const remove = mutation({
	args: { promptId: v.id("prompts") },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new Error("Not authenticated");
		}

		const userIsAdmin = await isAdmin(ctx, userId);
		if (!userIsAdmin) {
			throw new Error("Only admins can delete prompts");
		}

		const prompt = await ctx.db.get(args.promptId);
		if (!prompt) {
			throw new Error("Prompt not found");
		}

		await ctx.db.delete(args.promptId);
	},
});

export const getSystemPrompts = internalQuery({
	args: {},
	handler: async (ctx) => {
		const publicPrompts = await ctx.db
			.query("prompts")
			.withIndex("by_public", (q) =>
				q.eq("isPublic", true).eq("type", "system"),
			)
			.first();

		return publicPrompts;
	},
});
