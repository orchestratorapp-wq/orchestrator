import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";

export const list = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);

		// For anonymous users, create a temporary default project
		if (!userId) {
			return [];
		}

		return await ctx.db
			.query("projects")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.order("desc")
			.collect();
	},
});

export const single = query({
	args: {
		projectId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		try {
			const userId = await getAuthUserId(ctx);

			// For anonymous users, create a temporary default project
			if (!userId) {
				return null;
			}

			if (!args.projectId) {
				return null;
			}

			const project = await ctx.db.get(args.projectId as Id<"projects">);

			if (!project || project.userId !== userId) {
				return null;
			}

			const chat = await ctx.db
				.query("chats")
				.withIndex("by_project", (q) => q.eq("projectId", project._id))
				.order("desc")
				.first();

			return { project, chat };
		} catch {
			return null;
		}
	},
});

export const getDefault = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);

		// For anonymous users, return a virtual default project
		if (!userId) {
			throw new Error("Not authenticated");
		}

		const defaultProject = await ctx.db
			.query("projects")
			.withIndex("by_user_default", (q) =>
				q.eq("userId", userId).eq("isDefault", true),
			)
			.first();
		return defaultProject;
	},
});

export const ensureDefault = mutation({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new Error("Not authenticated");
		}

		let defaultProject = await ctx.db
			.query("projects")
			.withIndex("by_user_default", (q) =>
				q.eq("userId", userId).eq("isDefault", true),
			)
			.first();

		if (!defaultProject) {
			const projectId = await ctx.db.insert("projects", {
				name: "Default Project",
				description: "Your default project",
				userId,
				isDefault: true,
			});
			defaultProject = await ctx.db.get(projectId);
		}

		return defaultProject;
	},
});

export const create = mutation({
	args: {
		name: v.string(),
		description: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new Error("Must be logged in to create projects");
		}

		return await ctx.db.insert("projects", {
			name: args.name,
			description: args.description,
			userId,
			isDefault: false,
		});
	},
});

export const update = mutation({
	args: {
		projectId: v.id("projects"),
		name: v.string(),
		description: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new Error("Not authenticated");
		}

		const project = await ctx.db.get(args.projectId);
		if (!project || project.userId !== userId) {
			throw new Error("Project not found");
		}

		await ctx.db.patch(args.projectId, {
			name: args.name,
			description: args.description,
		});
	},
});

export const remove = mutation({
	args: { projectId: v.id("projects") },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new Error("Not authenticated");
		}

		const project = await ctx.db.get(args.projectId);
		if (!project || project.userId !== userId) {
			throw new Error("Project not found");
		}

		if (project.isDefault) {
			throw new Error("Cannot delete default project");
		}

		// Delete all chats and their messages for this project
		const chats = await ctx.db
			.query("chats")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.collect();

		for (const chat of chats) {
			const messages = await ctx.db
				.query("messages")
				.withIndex("by_chat", (q) => q.eq("chatId", chat._id))
				.collect();

			for (const message of messages) {
				await ctx.db.delete(message._id);
			}

			await ctx.db.delete(chat._id);
		}

		await ctx.db.delete(args.projectId);
	},
});

export const createProjectInternal = internalMutation({
	args: {
		userId: v.id("users"),
		name: v.string(),
		lexicalState: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const createdProject = await ctx.db.insert("projects", {
			userId: args.userId,
			name: args.name,
			lexicalState: args.lexicalState,
		});

		if (typeof createdProject !== "string") {
			return null;
		}

		const createdChat = await ctx.db.insert("chats", {
			userId: args.userId,
			projectId: createdProject,
		});

		return {
			project: await ctx.db.get(createdProject),
			chat: await ctx.db.get(createdChat),
		};
	},
});

export const updateProjectInternal = internalMutation({
	args: {
		projectId: v.id("projects"),
		name: v.optional(v.string()),
		lexicalState: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project) {
			throw new Error("Project not found");
		}

		const updateData: Omit<typeof args, "projectId"> = {};
		if (args.name !== undefined) updateData.name = args.name;
		if (args.lexicalState !== undefined)
			updateData.lexicalState = args.lexicalState;

		await ctx.db.patch(args.projectId, updateData);
	},
});
