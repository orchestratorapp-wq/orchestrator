import { ConvexAuthProvider } from "@convex-dev/auth/react";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { ConvexReactClient } from "convex/react";
import { Toaster } from "@/components/ui/sonner";
import appCss from "../index.css?url";

export const Route = createRootRouteWithContext()({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "Orchestrator",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),
	loader: async () => {
		const CONVEX_URL =
			(globalThis as unknown as Record<string, string>)?.VITE_CONVEX_URL || // CF Worker binding (if set as global)
			(typeof import.meta !== "undefined" && import.meta.env.VITE_CONVEX_URL) || // Vite/browser
			process.env.VITE_CONVEX_URL;

		return { CONVEX_URL };
	},
	component: RootDocument,
});

function RootDocument() {
	const loaderData = Route.useLoaderData() || [];

	const convex = new ConvexReactClient(loaderData.CONVEX_URL, {
		unsavedChangesWarning: true,
	});

	return (
		<html lang="en" className="dark h-full bg-white dark:bg-gray-900">
			<head>
				<HeadContent />
			</head>
			<body className="h-full">
				<ConvexAuthProvider client={convex}>
					<Outlet />
				</ConvexAuthProvider>
				<Toaster richColors />
				{/*<TanStackRouterDevtools position="bottom-left" />*/}
				<Scripts />
			</body>
		</html>
	);
}
