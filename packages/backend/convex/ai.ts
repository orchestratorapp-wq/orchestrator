import { v } from "convex/values";
import OpenAI from "openai";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";

export const generateResponse = internalAction({
	args: {
		project: v.union(v.null(), v.record(v.string(), v.string())),
		chat: v.record(v.string(), v.string()),
		messageId: v.id("messages"),
		userId: v.id("users"),
	},
	handler: async (ctx, args): Promise<{ project?: string }> => {
		const openai = new OpenAI({
			baseURL: process.env.CONVEX_OPENAI_BASE_URL,
			apiKey: process.env.CONVEX_OPENAI_API_KEY,
		});

		// Get chat history
		const messages = await ctx.runQuery(internal.compose.listChat, {
			chatId: args.chat._id as Id<"chats">,
		});

		// Build conversation context
		const conversation = messages.map((msg) => ({
			role: msg.role as "user" | "assistant",
			content: msg.content,
		}));

		const currentLexicalState = args.project?.lexicalState || "";

		const systemPrompts = await ctx.runQuery(internal.prompts.getSystemPrompts);

		// Base system prompt for daily planning
		const baseContent =
			systemPrompts?.content ||
			"You are an AI assistant that helps create beautiful daily plans. When responding, consider how your response could be structured as a well-organized daily plan. Provide clear, actionable information that can be easily converted into structured daily tasks, schedules, goals, and reflections. Structure your responses with clear sections like Morning Routine, Work Tasks, Evening Wind-down, Goals for Tomorrow, etc. Focus on creating meaningful, balanced daily plans that promote productivity and well-being.";

		// Adjusted project-specific instructions to enforce extraction and updates for project name and lexical state
		const projectInstructions = args.project
			? `Your current knowledge of the project "${args.project?.name}" is: ${currentLexicalState}

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
				const chat = args.chat;
				let project = args.project;

				console.log({
					projectUpdate,
					responseContent,
					project,
					args,
				});

				if (!args.project) {
					if (typeof projectUpdate.name === "string") {
						const createdProjectPayload = await ctx.runMutation(
							internal.projects.createProjectInternal,
							{
								userId: args.userId,
								name: projectUpdate.name,
								lexicalState: projectUpdate.lexical_state || undefined,
							},
						);
						if (createdProjectPayload?.project && createdProjectPayload.chat) {
							await ctx.runMutation(internal.messages.moveMessages, {
								fromChatId: chat._id as Id<"chats">,
								toChatId: createdProjectPayload?.chat._id,
							});

							project = createdProjectPayload.project as unknown as Record<
								string,
								string
							>;
						}
					}
				} else if (
					!!projectUpdate.name ||
					projectUpdate.lexical_state !== undefined
				) {
					const updateData: Partial<Doc<"projects">> = {};
					if (!!projectUpdate.name && projectUpdate.name !== project?.name) {
						updateData.name = projectUpdate.name;
					}
					if (
						!!projectUpdate.lexical_state &&
						projectUpdate.lexical_state !== currentLexicalState
					) {
						updateData.lexicalState = projectUpdate.lexical_state;
					}

					if (Object.keys(updateData).length > 0 && project?._id) {
						await ctx.runMutation(internal.projects.updateProjectInternal, {
							projectId: project?._id as Id<"projects">,
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

		return { project: args.project?._id as string };
	},
});
