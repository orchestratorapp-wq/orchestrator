import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const applicationTables = {
	projects: defineTable({
		name: v.string(),
		description: v.optional(v.string()),
		userId: v.optional(v.id("users")),
		type: v.optional(v.string()),
		subType: v.optional(v.string()),
		stage: v.optional(v.string()),
		isDefault: v.optional(v.boolean()),
		lexicalState: v.optional(v.string()),
	})
		.index("by_user", ["userId"])
		.index("by_user_default", ["userId", "isDefault"])
		.searchIndex("search_name", {
			searchField: "name",
			filterFields: ["userId"],
		}),

	chats: defineTable({
		userId: v.optional(v.id("users")),
		projectId: v.union(v.id("projects"), v.literal("anonymous_default")),
	})
		.index("by_user", ["userId"])
		.index("by_project", ["projectId"])
		.index("by_user_project", ["userId", "projectId"]),

	messages: defineTable({
		chatId: v.id("chats"),
		content: v.string(),
		role: v.union(v.literal("user"), v.literal("assistant")),
	}).index("by_chat", ["chatId"]),

	prompts: defineTable({
		content: v.string(),
		type: v.optional(v.string()),
		subType: v.optional(v.string()),
	})
		.index("by_type", ["type"])
		.index("by_sub_type", ["subType"]),

	// Admin roles table
	userRoles: defineTable({
		userId: v.id("users"),
		role: v.union(v.literal("admin"), v.literal("user")),
	}).index("by_user", ["userId"]),
};

export default defineSchema({
	...authTables,
	...applicationTables,
});
