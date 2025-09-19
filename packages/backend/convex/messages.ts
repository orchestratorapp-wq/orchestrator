import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import OpenAI from "openai";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
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
				console.log("_no_default_project_", args);
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
			console.log("_no_chat_", chatId);
			return [];
		}

		if (chat.userId !== userId) {
			console.log("_wrong_chat_user_", userId);
			return [];
		}

		return ctx.db
			.query("messages")
			.withIndex("by_chat", (q) => q.eq("chatId", chatId))
			.order("asc")
			.collect();
	},
});

export const send = mutation({
	args: {
		chatId: v.optional(v.union(v.id("chats"), v.literal("default"))),
		content: v.string(),
		projectId: v.optional(v.id("projects")),
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new Error("Authentication required");
		}

		let resolvedChatId: Id<"chats"> | null = null;

		if (args.chatId) {
			if (typeof args.chatId === "string" && args.chatId === "default") {
				// Resolve to the default chat
				const defaultProject = await ctx.db
					.query("projects")
					.withIndex("by_user_default", (q) =>
						q.eq("userId", userId).eq("isDefault", true),
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
						q.eq("userId", userId).eq("isDefault", true),
					)
					.first();

				if (defaultProject) {
					projectIdToUse = defaultProject._id;
				} else {
					projectIdToUse = await ctx.db.insert("projects", {
						name: "Default Project",
						description: "Your default project for daily planning",
						userId,
						isDefault: true,
					});
				}
			}

			resolvedChatId = await ctx.db.insert("chats", {
				userId,
				projectId: projectIdToUse,
			});
		}

		const chat = (await ctx.db.get(resolvedChatId)) as Doc<"chats"> | null;

		if (!chat) {
			throw new Error("Chat not found");
		}

		if (chat.userId !== userId) {
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
		});

		// Schedule AI response
		await ctx.scheduler.runAfter(0, internal.messages.generateResponse, {
			chatId: resolvedChatId,
			messageId: placeholderMessageId,
			userId,
		});

		return messageId;
	},
});

export const generateResponse = internalAction({
	args: {
		chatId: v.id("chats"),
		messageId: v.id("messages"),
		userId: v.id("users"),
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

		// Get chat and project for context
		const data = await ctx.runQuery(internal.messages.getChatAndProject, {
			chatId: args.chatId,
		});
		if (!data) {
			throw new Error("Chat not found");
		}
		const { chat, project: rawProject } = data;
		const project = rawProject as Doc<"projects"> | null;
		const currentLexicalState = project?.lexicalState || "";

		const systemPrompts = await ctx.runQuery(internal.prompts.getSystemPrompts);

		// Base system prompt for daily planning
		const baseContent =
			systemPrompts?.content ||
			"You are an AI assistant that helps create beautiful daily plans. When responding, consider how your response could be structured as a well-organized daily plan. Provide clear, actionable information that can be easily converted into structured daily tasks, schedules, goals, and reflections. Structure your responses with clear sections like Morning Routine, Work Tasks, Evening Wind-down, Goals for Tomorrow, etc. Focus on creating meaningful, balanced daily plans that promote productivity and well-being.";

		// Adjusted project-specific instructions to enforce extraction and updates for project name and lexical state
		const projectInstructions = project
			? `Your current knowledge of the project "${project.name}" is: ${currentLexicalState}

You MUST analyze the conversation and your response to determine if the project name or lexical state (which represents the entire project's plan or structure in the Lexical editor format) needs to be updated based on the user's input and your reply. The lexical state should be a valid JSON object capturing the full project structure, including sections like tasks, schedules, goals, etc., in a format suitable for a Lexical editor (e.g., a tree of nodes with types like 'root', 'paragraph', 'list-item', etc.).

Your output MUST ALWAYS be a valid JSON object with EXACTLY this structure, even if no updates are needed (in which case, set project_update fields to null or omit them as specified):

{
  "response": "The user-visible response content here. This should be a natural, conversational reply structured as a daily plan.",
  "project_update": {
    "name": "New project name if it should be changed based on the conversation (string), otherwise null",
    "lexical_state": "Updated lexical state for the entire project as a valid JSON string (escaped if necessary) if it should be changed, otherwise null"
  }
}

IMPORTANT RULES:
- ALWAYS output only valid JSON. Do not include any other text before, after, or around the JSON.
- The 'response' field must be the full, helpful reply to the user.
- For 'project_update':
  - Set 'name' to null if no name change is needed.
  - Set 'lexical_state' to null if no update is needed.
  - If updating lexical_state, ensure it is a complete, self-contained JSON representation of the project's Lexical editor state (e.g., {"root":{"children":[{"type":"paragraph","children":[{"text":"Updated plan..."}]}]}}).
- Base updates on the full conversation context to keep the project evolving accurately.`
			: `
You are working on a default project without specific context. If the conversation implies creating or updating a project name or structure, include updates in your JSON response.

Your output MUST ALWAYS be a valid JSON object with EXACTLY this structure:

{
  "response": "The user-visible response content here. This should be a natural, conversational reply structured as a daily plan.",
  "project_update": {
    "name": "Suggested project name (string) if relevant, otherwise null",
    "lexical_state": "Initial or updated lexical state as a valid JSON string if relevant, otherwise null"
  }
}

IMPORTANT RULES:
- ALWAYS output only valid JSON. Do not include any other text.
- Follow the same rules as above for project_update fields.`;

		// Add system prompt for daily planning with project context
		const systemPrompt = {
			role: "system" as const,
			content: `${baseContent}

${projectInstructions}`,
		};

		try {
			const response = await openai.chat.completions.create({
				model: "gpt-5-nano",
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

				console.log(1, project, responseContent, projectUpdate);

				if (!project) {
					if (typeof projectUpdate.name === "string") {
						const { chat: createdChat } = await ctx.runMutation(
							internal.projects.createProjectInternal,
							{
								userId: args.userId,
								name: projectUpdate.name,
								lexicalState: projectUpdate.lexical_state,
							},
						);

						await ctx.runMutation(internal.messages.moveMessages, {
							fromChatId: chat._id,
							toChatId: createdChat,
						});
					}
				} else if (
					projectUpdate.name !== null ||
					projectUpdate.lexical_state !== null
				) {
					const updateData: Partial<Doc<"projects">> = {};
					if (projectUpdate.name !== null && projectUpdate.name !== undefined) {
						updateData.name = projectUpdate.name;
					}
					if (
						projectUpdate.lexical_state !== null &&
						projectUpdate.lexical_state !== undefined
					) {
						updateData.lexicalState = projectUpdate.lexical_state;
					}

					if (Object.keys(updateData).length > 0) {
						await ctx.runMutation(internal.projects.updateProjectInternal, {
							projectId: chat.projectId as Id<"projects">,
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
	args: { chatId: v.id("chats") },
	handler: async (ctx, args) => {
		const chat = await ctx.db.get(args.chatId);
		if (!chat) return null;
		const project =
			typeof chat.projectId === "string"
				? null
				: await ctx.db.get(chat.projectId);
		return { chat, project };
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
