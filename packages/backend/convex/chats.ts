import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
	args: {
		projectId: v.optional(
			v.union(v.id("projects"), v.literal("anonymous_default"), v.null()),
		),
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);

		// For anonymous users, return empty array if no projectId specified
		if (!userId && !args.projectId) {
			return [];
		}

		if (args.projectId) {
			const projectId = args.projectId;
			return await ctx.db
				.query("chats")
				.withIndex("by_project", (q) => q.eq("projectId", projectId))
				.order("desc")
				.collect();
		}

		return await ctx.db
			.query("chats")
			.withIndex("by_user", (q) => q.eq("userId", userId || undefined))
			.order("desc")
			.collect();
	},
});

export const get = query({
	args: { chatId: v.id("chats") },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const chat = await ctx.db.get(args.chatId);

		if (!chat) {
			return null;
		}

		// Allow access if user owns the chat or if it's an anonymous chat
		if (chat.userId === userId || (!chat.userId && !userId)) {
			return chat;
		}

		return null;
	},
});

export const create = mutation({
	args: {
		projectId: v.id("projects"),
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);

		// For anonymous users, allow creating chats in the anonymous project
		if (!userId && args.projectId !== "anonymous_default") {
			throw new Error(
				"Anonymous users can only create chats in anonymous project",
			);
		}

		// For logged-in users, verify they own the project
		if (userId) {
			const project = await ctx.db.get(args.projectId);
			if (!project || project.userId !== userId) {
				throw new Error("Project not found");
			}
		}

		return await ctx.db.insert("chats", {
			userId: userId || undefined,
			projectId: args.projectId,
		});
	},
});

export const moveToProject = mutation({
	args: {
		chatId: v.id("chats"),
		projectId: v.id("projects"),
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new Error("Must be logged in to move chats");
		}

		const chat = await ctx.db.get(args.chatId);
		if (!chat || chat.userId !== userId) {
			throw new Error("Chat not found");
		}

		const project = await ctx.db.get(args.projectId);
		if (!project || project.userId !== userId) {
			throw new Error("Project not found");
		}

		await ctx.db.patch(args.chatId, {
			projectId: args.projectId,
		});
	},
});

export const remove = mutation({
	args: { chatId: v.id("chats") },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const chat = await ctx.db.get(args.chatId);

		if (!chat) {
			throw new Error("Chat not found");
		}

		// Allow deletion if user owns the chat or if it's an anonymous chat
		if (chat.userId !== userId && !(chat.userId === null && userId === null)) {
			throw new Error("Not authorized");
		}

		// Delete all messages in the chat
		const messages = await ctx.db
			.query("messages")
			.withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
			.collect();

		for (const message of messages) {
			await ctx.db.delete(message._id);
		}

		await ctx.db.delete(args.chatId);
	},
});
