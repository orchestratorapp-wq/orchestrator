import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { ConvexReactClient } from "convex/react";
import Loader from "./components/loader";
import { routeTree } from "./routeTree.gen";
import "./index.css";

export function createRouter() {
	const CONVEX_URL =
		(import.meta as unknown as { env: Record<string, string> }).env
			.VITE_CONVEX_URL || process.env.VITE_CONVEX_URL;
	if (!CONVEX_URL) {
		console.error("missing envar VITE_CONVEX_URL");
	}
	const convex = new ConvexReactClient(CONVEX_URL, {
		unsavedChangesWarning: true,
	});

	const router = createTanStackRouter({
		routeTree,
		defaultPreload: "intent",
		defaultPendingComponent: () => <Loader />,
		defaultNotFoundComponent: () => <div>Not Found</div>,
		context: { convexClient: convex },
		Wrap: ({ children }) => (
			<ConvexAuthProvider client={convex}>{children}</ConvexAuthProvider>
		),
	});
	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof createRouter>;
	}
}
