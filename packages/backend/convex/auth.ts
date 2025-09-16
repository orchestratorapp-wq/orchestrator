import Google from "@auth/core/providers/google";
import { convexAuth, getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";

export async function hashSha256(value: string): Promise<string> {
	const textEncoder = new TextEncoder();
	const data = textEncoder.encode(value);

	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
	providers: [
		Google({
			clientId: process.env.AUTH_GOOGLE_ID,
			clientSecret: process.env.AUTH_GOOGLE_SECRET,
			authorization: {
				params: {
					prompt: "select_account",
				},
			},
		}),
	],
});

export const loggedInUser = query({
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			return null;
		}
		const user = await ctx.db.get(userId);
		if (!user) {
			return null;
		}
		const hash = hashSha256(user.email || "person@example.com");

		return {
			...user,
			avatar_url:
				user.image || `https://www.gravatar.com/avatar/${hash}?d=identicon`,
		};
	},
});
