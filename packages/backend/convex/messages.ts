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
		});

		return {
			messageId: messageId,
			placeholderMessageId: placeholderMessageId,
			resolvedChatId: resolvedChatId,
			userId: args.userId,
		};
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
		let project = rawProject as Doc<"projects"> | null;
		const currentLexicalState = project?.lexicalState || "";

		const systemPrompts = await ctx.runQuery(internal.prompts.getSystemPrompts);

		// Base system prompt for daily planning
		const baseContent =
			systemPrompts?.content ||
			"You are an AI assistant that helps create beautiful daily plans. When responding, consider how your response could be structured as a well-organized daily plan. Provide clear, actionable information that can be easily converted into structured daily tasks, schedules, goals, and reflections. Structure your responses with clear sections like Morning Routine, Work Tasks, Evening Wind-down, Goals for Tomorrow, etc. Focus on creating meaningful, balanced daily plans that promote productivity and well-being.";

		// Adjusted project-specific instructions to enforce extraction and updates for project name and lexical state
		const projectInstructions = project
			? `Your current knowledge of the project "${project.name}" is: ${currentLexicalState}

You MUST analyze the full conversation history, the user's latest input, and craft your response to determine if the project name or lexical state needs updating. ALWAYS infer and propose updates when the conversation implies changes to the project theme, goals, structure, or name—do NOT default to null if there's any relevant signal (e.g., user mentions a new focus like "fitness plan" → suggest name "My Fitness Journey"; or adds tasks → expand the lexical state).

The lexical state MUST be a STRICT, VALID JSON object in the exact Lexical.dev editor format (see example below). It represents the ENTIRE project's plan as a serializable editor state: a tree starting with {"root": {"children": [...], ...}} where nodes have types like "root", "paragraph", "heading", "list", "list-item", etc., with properties like "children", "text", "format", "type", "version:1", etc. Do NOT output plain text or Markdown—only valid Lexical JSON that can be directly deserialized by Lexical's $generateFromJSON.

Example of valid lexical_state JSON (for a simple daily plan):
{
  "root": {
    "children": [
      {
        "children": [
          {
            "detail": 0,
            "format": 0,
            "mode": "normal",
            "style": "",
            "text": "Morning Routine",
            "type": "text",
            "version": 1
          }
        ],
        "direction": "ltr",
        "format": "",
        "indent": 0,
        "type": "heading",
        "version": 1
      },
      {
        "children": [
          {
            "detail": 0,
            "format": 0,
            "mode": "normal",
            "style": "",
            "text": "• Wake up at 7 AM",
            "type": "text",
            "version": 1
          }
        ],
        "direction": "ltr",
        "format": "",
        "indent": 0,
        "type": "list-item",
        "version": 1
      }
    ],
    "direction": "ltr",
    "format": "",
    "indent": 0,
    "type": "root",
    "version": 1
  }
}

Build the lexical_state incrementally: Start from the current state (${currentLexicalState ? "existing state" : "empty root"}), then append/modify sections based on the conversation (e.g., add new headings for tasks, lists for steps, paragraphs for reflections). Ensure it's complete and self-contained—cover all key elements from the entire chat history.

Your output MUST ALWAYS be a valid JSON object with EXACTLY this structure, even if minimal updates (but prefer updates over nulls when relevant):

{
  "response": "The user-visible response content here. This should be a natural, conversational reply structured as a daily plan.",
  "project_update": {
    "name": "New project name if the conversation suggests a theme/change (e.g., 'Fitness Plan 2025'), otherwise the current '${project.name}'",
    "lexical_state": "The FULL updated lexical_state as a valid JSON string (properly escaped) representing the entire project editor state"
  }
}

IMPORTANT RULES:
- ALWAYS output only valid JSON. Do not include any other text before, after, or around the JSON. No explanations or comments.
- The 'response' field must be the full, helpful reply to the user—conversational and plan-oriented.
- For 'project_update':
  - 'name': ALWAYS provide a string (never null)—infer/update based on conversation (e.g., if user says 'let's plan my coding project', set to 'My Coding Project'). Keep it descriptive and relevant.
  - 'lexical_state': ALWAYS provide a full valid Lexical JSON string (never null)—evolve it to reflect the cumulative project plan from the chat. Use headings for sections, lists for tasks, etc.
- Base ALL updates on the full conversation context to keep the project evolving accurately and comprehensively.`
			: `
You are working on a default project without specific context. ALWAYS infer a project name and initial structure from the conversation—do NOT use nulls; create meaningful defaults based on user input (e.g., if about 'daily workout', name it 'Daily Workout Plan' and build a basic lexical state with relevant sections).

The lexical state MUST be a STRICT, VALID JSON object in the exact Lexical.dev editor format (see example below). It represents the ENTIRE project's plan as a serializable editor state: a tree starting with {"root": {"children": [...], ...}} where nodes have types like "root", "paragraph", "heading", "list", "list-item", etc., with properties like "children", "text", "format", "type", "version:1", etc. Do NOT output plain text or Markdown—only valid Lexical JSON that can be directly deserialized by Lexical's $generateFromJSON.

Example of valid lexical_state JSON (for a simple daily plan):
{
  "root": {
    "children": [
      {
        "children": [
          {
            "detail": 0,
            "format": 0,
            "mode": "normal",
            "style": "",
            "text": "Morning Routine",
            "type": "text",
            "version": 1
          }
        ],
        "direction": "ltr",
        "format": "",
        "indent": 0,
        "type": "heading",
        "version": 1
      },
      {
        "children": [
          {
            "detail": 0,
            "format": 0,
            "mode": "normal",
            "style": "",
            "text": "• Wake up at 7 AM",
            "type": "text",
            "version": 1
          }
        ],
        "direction": "ltr",
        "format": "",
        "indent": 0,
        "type": "list-item",
        "version": 1
      }
    ],
    "direction": "ltr",
    "format": "",
    "indent": 0,
    "type": "root",
    "version": 1
  }
}

Your output MUST ALWAYS be a valid JSON object with EXACTLY this structure:

{
  "response": "The user-visible response content here. This should be a natural, conversational reply structured as a daily plan.",
  "project_update": {
    "name": "Inferred project name as a descriptive string (e.g., 'Daily Productivity Plan') based on the conversation",
    "lexical_state": "The FULL initial lexical_state as a valid JSON string (properly escaped) representing the project editor state from the chat"
  }
}

IMPORTANT RULES:
- ALWAYS output only valid JSON. Do not include any other text.
- The 'response' field must be the full, helpful reply to the user—conversational and plan-oriented.
- For 'project_update':
  - 'name': ALWAYS a non-null string—infer from conversation themes (e.g., productivity → 'My Daily Planner').
  - 'lexical_state': ALWAYS a full valid Lexical JSON string (never null)—build a complete initial structure with sections inferred from the chat (use headings, lists, etc.).
- Lexical is editor https://lexical.dev/ and it has specific json state—stick to the format precisely.`;

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

				console.log({ projectUpdate, responseContent });

				if (!project) {
					if (typeof projectUpdate.name === "string") {
						const { chat: createdChat, project: createdProject } =
							await ctx.runMutation(internal.projects.createProjectInternal, {
								userId: args.userId,
								name: projectUpdate.name,
								lexicalState: projectUpdate.lexical_state || undefined,
							});

						await ctx.runMutation(internal.messages.moveMessages, {
							fromChatId: chat._id,
							toChatId: createdChat,
						});

						project = createdProject;
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

		return { project };
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
