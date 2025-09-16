import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import type { ConvexReactClient } from "convex/react";
import { Toaster } from "@/components/ui/sonner";
import appCss from "../index.css?url";

export interface RouterAppContext {
	convexClient: ConvexReactClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
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
				title: "My App",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),

	component: RootDocument,
});

function RootDocument() {
	return (
		<html lang="en" className="dark h-full bg-white dark:bg-gray-900">
			<head>
				<HeadContent />
			</head>
			<body className="h-full">
				<Outlet />
				<Toaster richColors />
				{/*<TanStackRouterDevtools position="bottom-left" />*/}
				<Scripts />
			</body>
		</html>
	);
}
