import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery } from "./_generated/server";

export const listChat = internalQuery({
	args: { chatId: v.id("chats") },
	handler: async (ctx, args) => {
		return ctx.db
			.query("messages")
			.withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
			.order("asc")
			.collect();
	},
});

export const composeMessage = action({
	args: {
		content: v.string(),
		chatId: v.optional(v.union(v.id("chats"), v.literal("default"))),
		projectId: v.optional(v.id("projects")),
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);

		if (!userId) {
			throw new Error("Authentication required");
		}

		const sendPayload = await ctx.runMutation(internal.compose.send, {
			userId,
			content: args.content,
			chatId: args.chatId,
			projectId: args.projectId,
		});

		const { chat, project } = await ctx.runQuery(
			internal.messages.getChatAndProject,
			{
				chatId: sendPayload.resolvedChatId,
				projectId: args.projectId,
			},
		);

		if (!chat) {
			throw new Error("Chat not found");
		}

		await ctx.runAction(internal.ai.generateResponse, {
			messageId: sendPayload.placeholderMessageId,
			chat,
			project,
			userId,
		});
	},
});

export const send = internalMutation({
	args: {
		userId: v.id("users"),
		content: v.string(),
		chatId: v.optional(v.union(v.id("chats"), v.literal("default"))),
		projectId: v.optional(v.id("projects")),
	},
	returns: {
		placeholderMessageId: v.id("messages"),
		resolvedChatId: v.id("chats"),
	},
	handler: async (ctx, args) => {
		let resolvedChatId: Id<"chats"> | null = null;

		if (args.chatId) {
			if (typeof args.chatId === "string" && args.chatId === "default") {
				// Resolve to the default chat
				const defaultProject = await ctx.db
					.query("projects")
					.withIndex("by_user_default", (q) =>
						q.eq("userId", args.userId).eq("isDefault", true),
					)
					.first();

				if (defaultProject) {
					const chat = await ctx.db
						.query("chats")
						.withIndex("by_project", (q) =>
							q.eq("projectId", defaultProject._id),
						)
						.first();
					if (chat) {
						resolvedChatId = chat._id;
					}
				}
			} else {
				resolvedChatId = args.chatId as Id<"chats">;
			}
		}

		let projectIdToUse = args.projectId;
		if (!resolvedChatId) {
			if (!projectIdToUse) {
				const defaultProject = await ctx.db
					.query("projects")
					.withIndex("by_user_default", (q) =>
						q.eq("userId", args.userId).eq("isDefault", true),
					)
					.first();

				if (defaultProject) {
					projectIdToUse = defaultProject._id;
				} else {
					projectIdToUse = await ctx.db.insert("projects", {
						name: "Default Project",
						description: "Your default project for daily planning",
						userId: args.userId,
						isDefault: true,
					});
				}
			}

			resolvedChatId = await ctx.db.insert("chats", {
				userId: args.userId,
				projectId: projectIdToUse,
			});
		}

		const chat = (await ctx.db.get(resolvedChatId)) as Doc<"chats"> | null;

		if (!chat) {
			throw new Error("Chat not found");
		}

		if (chat.userId !== args.userId) {
			throw new Error("Not authorized");
		}

		// Insert user message
		const messageId = await ctx.db.insert("messages", {
			chatId: resolvedChatId,
			content: args.content,
			role: "user",
		});

		// Insert placeholder assistant message
		const placeholderMessageId = await ctx.db.insert("messages", {
			chatId: resolvedChatId,
			content: "Generating response...",
			role: "assistant",
			meta: {
				type: "temporary",
				last_message: messageId,
			},
		});

		return {
			placeholderMessageId: placeholderMessageId,
			resolvedChatId: resolvedChatId,
		};
	},
});
