import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import OpenAI from "openai";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
	action,
	internalAction,
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

		const sendPayload = await ctx.runMutation(internal.messages.send, {
			userId,
			content: args.content,
			chatId: args.chatId,
			projectId: args.projectId,
		});

		return ctx.runAction(internal.messages.generateResponse, {
			chatId: sendPayload.resolvedChatId,
			messageId: sendPayload.placeholderMessageId,
			projectId: args.projectId,
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

export const generateResponse = internalAction({
	args: {
		chatId: v.id("chats"),
		projectId: v.optional(v.id("projects")),
		messageId: v.id("messages"),
		userId: v.id("users"),
	},
	returns: {
		project: v.optional(v.id("projects")),
	},
	handler: async (ctx, args) => {
		const openai = new OpenAI({
			baseURL: process.env.CONVEX_OPENAI_BASE_URL,
			apiKey: process.env.CONVEX_OPENAI_API_KEY,
		});

		// Get chat history
		const messages = await ctx.runQuery(internal.messages.listChat, {
			chatId: args.chatId,
		});

		// Build conversation context
		const conversation = messages.map((msg) => ({
			role: msg.role as "user" | "assistant",
			content: msg.content,
		}));

		let { chat, project } = await ctx.runQuery(
			internal.messages.getChatAndProject,
			{
				chatId: args.chatId,
				projectId: args.projectId,
			},
		);

		if (!chat) {
			throw new Error("Chat not found");
		}

		const currentLexicalState = project?.lexicalState || "";

		const systemPrompts = await ctx.runQuery(internal.prompts.getSystemPrompts);

		// Base system prompt for daily planning
		const baseContent =
			systemPrompts?.content ||
			"You are an AI assistant that helps create beautiful daily plans. When responding, consider how your response could be structured as a well-organized daily plan. Provide clear, actionable information that can be easily converted into structured daily tasks, schedules, goals, and reflections. Structure your responses with clear sections like Morning Routine, Work Tasks, Evening Wind-down, Goals for Tomorrow, etc. Focus on creating meaningful, balanced daily plans that promote productivity and well-being.";

		// Adjusted project-specific instructions to enforce extraction and updates for project name and lexical state
		const projectInstructions = project
			? `Your current knowledge of the project "${project.name}" is: ${currentLexicalState}

Analyze the conversation and update the project name and lexical_state if needed. Infer changes from user input, like new themes or tasks.

The lexical_state must be extremely well-formatted Markdown, representing the entire project's plan. Use clear headings, bullet points, and subheadings for structure. Ensure it is concise, readable, and free of errors. Do not include any content in the response that duplicates or references the lexical_state directly.

Build incrementally from the current state, appending new sections only when relevant, and maintain a cohesive plan.

Output JSON with:

{
  "response": "Conversational reply as a daily plan, without repeating any part of the lexical_state.",
  "project_update": {
    "name": "Updated or current name",
    "lexical_state": "Full Markdown string for the project plan"
  }
}

Rules:
- Output valid JSON only.
- 'lexical_state' as Markdown string (never null).
- Infer name and build plan from chat.
- Ensure lexical_state is always well-formatted and complete Markdown.`
			: `
Infer project name and structure from conversation.

The lexical_state must be extremely well-formatted Markdown. Use clear headings, bullet points, and subheadings for structure. Ensure it is concise, readable, and free of errors. Do not include any content in the response that duplicates or references the lexical_state directly.

Output JSON:

{
  "response": "Reply as a daily plan, without repeating any part of the lexical_state.",
  "project_update": {
    "name": "Inferred name",
    "lexical_state": "Markdown string"
  }
}

Rules:
- Output valid JSON only.
- 'lexical_state' as Markdown string.`;

		// Add system prompt for daily planning with project context
		const systemPrompt = {
			role: "system" as const,
			content: `${baseContent}

${projectInstructions}`,
		};

		try {
			const response = await openai.chat.completions.create({
				model: systemPrompts?.model || "gpt-5-nano",
				messages: [systemPrompt, ...conversation],
			});

			const content = response.choices[0]?.message?.content;
			if (!content) {
				throw new Error("No response from AI");
			}

			// Parse AI response for project updates
			try {
				const parsed = JSON.parse(content);
				const responseContent = parsed.response || content;
				const projectUpdate = parsed.project_update || {};

				console.log({ projectUpdate, responseContent, project, args });

				if (!project) {
					if (typeof projectUpdate.name === "string") {
						const createdProjectPayload = await ctx.runMutation(
							internal.projects.createProjectInternal,
							{
								userId: args.userId,
								name: projectUpdate.name,
								lexicalState: projectUpdate.lexical_state || undefined,
							},
						);

						await ctx.runMutation(internal.messages.moveMessages, {
							fromChatId: chat._id,
							toChatId: createdProjectPayload?.chat,
						});

						project = createdProjectPayload.project;
					}
				} else if (
					!!projectUpdate.name ||
					projectUpdate.lexical_state !== undefined
				) {
					const updateData: Partial<Doc<"projects">> = {};
					if (!!projectUpdate.name && projectUpdate.name !== project.name) {
						updateData.name = projectUpdate.name;
					}
					if (
						!!projectUpdate.lexical_state &&
						projectUpdate.lexical_state !== currentLexicalState
					) {
						updateData.lexicalState = projectUpdate.lexical_state;
					}

					if (Object.keys(updateData).length > 0) {
						await ctx.runMutation(internal.projects.updateProjectInternal, {
							projectId: project._id,
							...updateData,
						});
					}
				}

				await ctx.runMutation(api.messages.saveResponse, {
					messageId: args.messageId,
					content: responseContent,
				});
			} catch (parseError) {
				console.error("Error parsing AI response as JSON:", parseError);
				await ctx.runMutation(api.messages.saveResponse, {
					messageId: args.messageId,
					content,
				});
			}
		} catch (error) {
			console.error("Error generating AI response:", error);
			await ctx.runMutation(api.messages.saveResponse, {
				messageId: args.messageId,
				content: "Sorry, I encountered an error while processing your request.",
			});
		}

		return { project: project?._id };
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
	handler: async (ctx, args) => {
		const chat = await ctx.db.get(args.chatId);

		if (!chat) {
			throw new Error("Chat not found");
		}

		const project = !args.projectId ? null : await ctx.db.get(args.projectId);

		return { chat: chat, project: project };
	},
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
