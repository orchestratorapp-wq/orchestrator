import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/prompts")({
	component: AdminPrompts,
});

function AdminPrompts() {
	return (
		<div className="mx-6 overflow-hidden bg-white shadow sm:rounded-md dark:bg-gray-800">
			<Outlet />
		</div>
	);
}
