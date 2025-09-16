import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import OpenAI from "openai";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, mutation, query } from "./_generated/server";

export const list = query({
	args: { chatId: v.union(v.id("chats"), v.literal("default")) },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
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
				return [];
			}
			const chat = await ctx.db
				.query("chats")
				.withIndex("by_project", (q) => q.eq("projectId", defaultProject._id))
				.first();
			if (!chat) {
				return [];
			}
			chatId = chat._id;
		}

		const chat: Doc<"chats"> | null = await ctx.db.get(chatId);
		if (!chat) {
			return [];
		}

		if (chat.userId !== userId) {
			return [];
		}

		return await ctx.db
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
				title: "Daily Plan",
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

		// Schedule AI response
		await ctx.scheduler.runAfter(0, api.messages.generateResponse, {
			chatId: resolvedChatId,
		});

		return messageId;
	},
});

export const generateResponse = action({
	args: { chatId: v.id("chats") },
	handler: async (ctx, args) => {
		const openai = new OpenAI({
			baseURL: process.env.CONVEX_OPENAI_BASE_URL,
			apiKey: process.env.CONVEX_OPENAI_API_KEY,
		});

		// Get chat history
		const messages = await ctx.runQuery(api.messages.list, {
			chatId: args.chatId,
		});

		// Build conversation context
		const conversation = messages.map((msg) => ({
			role: msg.role as "user" | "assistant",
			content: msg.content,
		}));

		const systemPrompts = await ctx.runQuery(internal.prompts.getSystemPrompts);

		// Add system prompt for daily planning
		const systemPrompt = {
			role: "system" as const,
			content:
				systemPrompts?.content ||
				"You are an AI assistant that helps create beautiful daily plans. When responding, consider how your response could be structured as a well-organized daily plan. Provide clear, actionable information that can be easily converted into structured daily tasks, schedules, goals, and reflections. Structure your responses with clear sections like Morning Routine, Work Tasks, Evening Wind-down, Goals for Tomorrow, etc. Focus on creating meaningful, balanced daily plans that promote productivity and well-being.",
		};

		try {
			const response = await openai.chat.completions.create({
				model: "gpt-5",
				messages: [systemPrompt, ...conversation],
				temperature: 0.7,
			});

			const content = response.choices[0]?.message?.content;
			if (!content) {
				throw new Error("No response from AI");
			}

			// Generate Lexical state from AI response
			const lexicalState = await generateLexicalState(content);

			// Save AI response
			await ctx.runMutation(api.messages.saveResponse, {
				chatId: args.chatId,
				content,
				lexicalState,
			});
		} catch (error) {
			console.error("Error generating AI response:", error);
			await ctx.runMutation(api.messages.saveResponse, {
				chatId: args.chatId,
				content: "Sorry, I encountered an error while processing your request.",
				lexicalState: JSON.stringify({
					root: {
						children: [
							{
								children: [
									{
										detail: 0,
										format: 0,
										mode: "normal",
										style: "",
										text: "Sorry, I encountered an error while processing your request.",
										type: "text",
										version: 1,
									},
								],
								direction: "ltr",
								format: "",
								indent: 0,
								type: "paragraph",
								version: 1,
							},
						],
						direction: "ltr",
						format: "",
						indent: 0,
						type: "root",
						version: 1,
					},
				}),
			});
		}
	},
});

export const saveResponse = mutation({
	args: {
		chatId: v.id("chats"),
		content: v.string(),
		lexicalState: v.string(),
	},
	handler: async (ctx, args) => {
		return await ctx.db.insert("messages", {
			chatId: args.chatId,
			content: args.content,
			role: "assistant",
			lexicalState: args.lexicalState,
		});
	},
});

// Helper function to convert AI response to Lexical state
async function generateLexicalState(content: string): Promise<string> {
	// Parse the content and create structured Lexical nodes
	const paragraphs = content.split("\n\n").filter((p) => p.trim());

	const children = paragraphs.map((paragraph) => {
		// Check if it's a heading
		if (paragraph.startsWith("#")) {
			const level = paragraph.match(/^#+/)?.[0].length || 1;
			const text = paragraph.replace(/^#+\s*/, "");
			return {
				children: [
					{
						detail: 0,
						format: 1, // bold
						mode: "normal",
						style: "",
						text,
						type: "text",
						version: 1,
					},
				],
				direction: "ltr",
				format: "",
				indent: 0,
				type: "heading",
				tag: `h${Math.min(level, 6)}`,
				version: 1,
			};
		}

		// Check if it's a list item
		if (paragraph.startsWith("- ") || paragraph.startsWith("* ")) {
			const text = paragraph.replace(/^[-*]\s*/, "");
			return {
				children: [
					{
						children: [
							{
								detail: 0,
								format: 0,
								mode: "normal",
								style: "",
								text,
								type: "text",
								version: 1,
							},
						],
						direction: "ltr",
						format: "",
						indent: 0,
						type: "listitem",
						version: 1,
						value: 1,
					},
				],
				direction: "ltr",
				format: "",
				indent: 0,
				type: "list",
				listType: "bullet",
				start: 1,
				tag: "ul",
				version: 1,
			};
		}

		// Regular paragraph
		return {
			children: [
				{
					detail: 0,
					format: 0,
					mode: "normal",
					style: "",
					text: paragraph,
					type: "text",
					version: 1,
				},
			],
			direction: "ltr",
			format: "",
			indent: 0,
			type: "paragraph",
			version: 1,
		};
	});

	return JSON.stringify({
		root: {
			children,
			direction: "ltr",
			format: "",
			indent: 0,
			type: "root",
			version: 1,
		},
	});
}
