import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "./_generated/server";

export const list = query({
	args: { chatId: v.union(v.id("chats"), v.literal("default")) },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			console.log("_no_user_id_chat_list_", args);
			return [];
		}

		let chatId = args.chatId;
		if (typeof chatId === "string" && chatId === "default") {
			const defaultProject = await ctx.db
				.query("projects")
				.withIndex("by_user_default", (q) =>
					q.eq("userId", userId).eq("isDefault", true),
				)
				.first();
			if (!defaultProject) {
				// console.log("_no_default_project_", args);
				return [];
			}
			const chat = await ctx.db
				.query("chats")
				.withIndex("by_project", (q) => q.eq("projectId", defaultProject._id))
				.first();
			if (!chat) {
				console.log("_no_chat_", chat, defaultProject);
				return [];
			}
			chatId = chat._id;
		}

		const chat: Doc<"chats"> | null = await ctx.db.get(chatId);
		if (!chat) {
			// console.log("_no_chat_", chatId);
			return [];
		}

		if (chat.userId !== userId) {
			// console.log("_wrong_chat_user_", userId);
			return [];
		}

		return ctx.db
			.query("messages")
			.withIndex("by_chat", (q) => q.eq("chatId", chatId))
			.order("asc")
			.collect();
	},
});

export const saveResponse = mutation({
	args: {
		messageId: v.id("messages"),
		content: v.string(),
	},
	handler: async (ctx, args) => {
		return await ctx.db.patch(args.messageId, {
			content: args.content,
		});
	},
});

export const getChatAndProject = internalQuery({
	args: { chatId: v.id("chats"), projectId: v.optional(v.id("projects")) },
	returns: {
		chat: v.any(),
		project: v.any(),
	},
	handler: async (ctx, args) => {
		const chat = await ctx.db.get(args.chatId);

		if (!chat) {
			throw new Error("Chat not found");
		}

		const project = !args.projectId ? null : await ctx.db.get(args.projectId);

		return { chat: chat, project: project };
	},
});

export const moveMessages = internalMutation({
	args: {
		fromChatId: v.id("chats"),
		toChatId: v.id("chats"),
	},
	handler: async (ctx, args) => {
		const messages = await ctx.db
			.query("messages")
			.withIndex("by_chat", (q) => q.eq("chatId", args.fromChatId))
			.order("asc")
			.collect();

		for (const message of messages) {
			await ctx.db.patch(message._id, { chatId: args.toChatId });
		}
	},
});
