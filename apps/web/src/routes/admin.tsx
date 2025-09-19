import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@orhcestrator/backend/convex/_generated/api";
import {
	createFileRoute,
	Link,
	Outlet,
	useLocation,
	useNavigate,
} from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import { useEffect } from "react";
import { UserProfileDropdown } from "@/components/UserProfileDropdown";

export const Route = createFileRoute("/admin")({
	component: AdminLanding,
});

function AdminLanding() {
	const navigate = useNavigate();

	const { signOut } = useAuthActions();
	const { isAuthenticated, isLoading } = useConvexAuth();
	const user = useQuery(api.auth.loggedInUser, isAuthenticated ? {} : "skip");

	useEffect(() => {
		if (user?.role !== "admin") {
			navigate({ to: "..", replace: true });
		}
	}, [navigate, user?.role]);

	if (isLoading) {
		return (
			<div className="flex h-full items-center justify-center bg-gray-50 dark:bg-gray-900">
				<p className="text-gray-900 dark:text-white">Loading...</p>
			</div>
		);
	}

	return (
		<div className="h-full bg-gray-50 dark:bg-gray-900">
			<div className="flex h-full">
				<div className="hidden w-64 bg-white shadow-lg lg:flex lg:flex-col dark:bg-gray-800">
					<div className="flex h-16 items-center justify-center">
						<h2 className="font-bold text-gray-900 text-xl dark:text-white">
							Admin
						</h2>
					</div>
					<nav className="flex-1 px-4 py-4">
						<ul className="space-y-2">
							<li>
								<Link
									to="/admin/prompts"
									className="block rounded-md px-3 py-2 text-gray-900 hover:bg-gray-200 dark:text-white dark:hover:bg-gray-600"
								>
									Manage Prompts
								</Link>
							</li>
						</ul>
					</nav>
					<div className="border-gray-200 border-t p-4 dark:border-gray-700">
						<UserProfileDropdown user={user} signOut={signOut} />
					</div>
				</div>

				{/* Main content */}
				<div className="flex flex-1 flex-col">
					<header className="bg-white shadow dark:bg-gray-800">
						<div className="flex h-16 items-center px-4">
							<div className="flex-1">
								<h1 className="font-bold text-2xl text-gray-900 dark:text-white">
									Admin Dashboard
								</h1>
							</div>
							<div>
								<CreatePromptButton />
							</div>
						</div>
					</header>
					<main className="flex-1 overflow-y-auto py-6">
						<Outlet />
					</main>
				</div>
			</div>
		</div>
	);
}

function CreatePromptButton() {
	const location = useLocation();
	const isOnPromptsRoute = location.pathname.endsWith("/admin/prompts");

	return isOnPromptsRoute ? (
		<Link
			to="/admin/prompts/$id"
			params={{ id: "new" }}
			className="rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-500"
		>
			Create Prompt
		</Link>
	) : null;
}
