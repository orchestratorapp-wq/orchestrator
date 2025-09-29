import { v } from "convex/values";
import OpenAI from "openai";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";

export const generateResponse = internalAction({
	args: {
		project: v.union(v.null(), v.any()),
		chat: v.any(),
		messageId: v.id("messages"),
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const openai = new OpenAI({
			baseURL: process.env.CONVEX_OPENAI_BASE_URL,
			apiKey: process.env.CONVEX_OPENAI_API_KEY,
		});

		// Get chat history
		const messages = await ctx.runQuery(internal.compose.listChat, {
			chatId: args.chat._id,
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
			"You are an AI assistant that helps create beautiful daily plans. When responding, consider how your response could be structured as a well-organized daily plan. Provide clear, actionable information that can be easily converted into structured daily tasks, schedules, goals, and reflections. Structure your responses with clear sections like Morning Routine, Work Tasks, Evening Wind-down, Goals for Tomorrow, etc. Focus on creating meaningful, balanced daily plans that promote productivity and well-being.";

		// Add system prompt for daily planning with project context
		const systemPrompt = {
			role: "system" as const,
			content: systemPrompts?.[0]?.content || baseContent,
		};

		try {
			const response = await openai.chat.completions.create({
				model: systemPrompts?.[0]?.model || "gpt-5-nano",
				messages: [systemPrompt, ...conversation],
				tools: [
					{
						type: "function",
						function: {
							name: "return_plan",
							description: "Return exactly the structured daily plan JSON.",
							parameters: {
								type: "object",
								additionalProperties: false,
								properties: {
									response: {
										type: "string",
										description:
											"Conversational reply as a daily plan, without repeating any part of the lexical_state, this can be markdown with beutiful formating as needed",
									},
									project_update: {
										type: "object",
										additionalProperties: false,
										properties: {
											name: {
												type: "string",
												description: "Updated or current name",
											},
											lexical_state: {
												type: "string",
												description:
													"Full Markdown string for the project plan, must be beautifully formatted with proper headings and subheadings, lists and all that markdown supports.",
											},
										},
										required: ["name", "lexical_state"],
									},
								},
								required: ["response", "project_update"],
							},
						},
					},
				],
				tool_choice: { type: "function", function: { name: "return_plan" } },
			});

			const choice = response.choices?.[0];
			const toolCall = choice?.message?.tool_calls?.[0];
			const content = choice?.message?.content;

			if (!toolCall && !content) {
				throw new Error("No response from AI");
			}

			// Parse AI response for project updates
			try {
				let parsed:
					| {
							response?: string;
							project_update?: { name?: string; lexical_state?: string };
					  }
					| undefined;

				if (
					toolCall &&
					toolCall.type === "function" &&
					toolCall.function?.name === "return_plan"
				) {
					try {
						parsed = JSON.parse(toolCall.function.arguments);
					} catch (e) {
						console.error(
							"Invalid JSON in function arguments:",
							toolCall.function.arguments,
							e,
						);
					}
				}

				if (!parsed && typeof content === "string") {
					try {
						parsed = JSON.parse(content);
					} catch (_e) {
						// fall through; we'll save raw content below
					}
				}

				if (!parsed) {
					await ctx.runMutation(api.messages.saveResponse, {
						messageId: args.messageId,
						content: content || "",
					});
					return { project: args.project?._id as string };
				}

				const responseContent = parsed.response || content || "";
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
								fromChatId: chat._id,
								toChatId: createdProjectPayload?.chat._id,
							});

							project = createdProjectPayload.project;
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
							projectId: project?._id,
							...updateData,
						});
					}
				}

				await ctx.runMutation(api.messages.saveResponse, {
					messageId: args.messageId,
					content: responseContent,
				});

				return { project: project?._id as string };
			} catch (parseError) {
				console.error("Error parsing AI response as JSON:", parseError);
				await ctx.runMutation(api.messages.saveResponse, {
					messageId: args.messageId,
					content: content || "",
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
