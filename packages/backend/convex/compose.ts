import { ActionRetrier } from "@convex-dev/action-retrier";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery } from "./_generated/server";

const retrier = new ActionRetrier(components.actionRetrier, {
	initialBackoffMs: 10000,
	base: 10,
	maxFailures: 4,
});

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
		// Keep accepting "default" for backward compatibility with the UI,
		// but we'll resolve it here without relying on default project behavior.
		chatId: v.optional(v.union(v.id("chats"), v.literal("default"))),
		projectId: v.optional(v.id("projects")),
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);

		if (!userId) {
			throw new Error("Authentication required");
		}

		// Resolve project/chat up-front. If neither is provided (or chatId is "default"),
		// immediately create an "untitled" project + initial chat and return that project id.
		let resolvedProjectId = args.projectId as Id<"projects"> | undefined;
		let resolvedChatId: Id<"chats"> | undefined;

		let createdProject: Doc<"projects"> | null = null;
		let createdChat: Doc<"chats"> | null = null;

		if (args.chatId && args.chatId !== "default") {
			resolvedChatId = args.chatId as Id<"chats">;
		}

		if (!resolvedProjectId && !resolvedChatId) {
			// Create a brand new project + chat right away
			const created = await ctx.runMutation(
				internal.projects.createProjectInternal,
				{
					userId,
					name: "untitled",
				},
			);

			if (!created || !created.project?._id || !created.chat?._id) {
				throw new Error("Failed to create a new project");
			}

			createdProject = created.project as Doc<"projects">;
			createdChat = created.chat as Doc<"chats">;

			resolvedProjectId = createdProject._id as Id<"projects">;
			resolvedChatId = createdChat._id as Id<"chats">;
		}

		// Insert the user's message (and placeholder assistant message).
		// If chatId is missing but projectId is present, `send` will create a chat for that project.
		const sendPayload = await ctx.runMutation(internal.compose.send, {
			userId,
			content: args.content,
			chatId: resolvedChatId,
			projectId: resolvedProjectId,
		});

		// Prepare data for AI generation (fire-and-forget).
		let chat: Doc<"chats"> | null = createdChat;
		let project: Doc<"projects"> | null = createdProject;

		if (!chat || !project) {
			const fetched = await ctx.runQuery(internal.messages.getChatAndProject, {
				chatId: sendPayload.resolvedChatId,
				projectId: resolvedProjectId,
			});
			chat = fetched.chat as Doc<"chats"> | null;
			project = fetched.project as Doc<"projects"> | null;
		}

		// Trigger AI generation in the background without blocking the response.
		if (chat) {
			await retrier.run(ctx, internal.ai.generateResponse, {
				messageId: sendPayload.placeholderMessageId,
				chat,
				project,
				userId,
			});
		}

		const projectIdToReturn = (resolvedProjectId ??
			project?._id ??
			(chat ? (chat.projectId as Id<"projects">) : undefined)) as
			| Id<"projects">
			| undefined;

		if (!projectIdToReturn) {
			throw new Error("Project resolution failed");
		}

		// Return the project id immediately so the client can redirect without waiting for AI.
		return { project: projectIdToReturn };
	},
});

export const send = internalMutation({
	args: {
		userId: v.id("users"),
		content: v.string(),
		// Remove "default" handling. Either chatId or projectId must be provided now.
		chatId: v.optional(v.id("chats")),
		projectId: v.optional(v.id("projects")),
	},
	returns: {
		placeholderMessageId: v.id("messages"),
		resolvedChatId: v.id("chats"),
	},
	handler: async (ctx, args) => {
		let resolvedChatId: Id<"chats"> | null = null;

		if (args.chatId) {
			resolvedChatId = args.chatId as Id<"chats">;
		} else {
			if (!args.projectId) {
				throw new Error("Project or chatId required");
			}

			const project = await ctx.db.get(args.projectId);
			if (!project) {
				throw new Error("Project not found");
			}
			if (project.userId !== args.userId) {
				throw new Error("Not authorized");
			}

			resolvedChatId = await ctx.db.insert("chats", {
				userId: args.userId,
				projectId: args.projectId,
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
			placeholderMessageId,
			resolvedChatId,
		};
	},
});
