import { api } from "@orhcestrator/backend/convex/_generated/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";

export const Route = createFileRoute("/admin/prompts/")({
	component: RouteComponent,
});

function RouteComponent() {
	const prompts = useQuery(api.prompts.list);

	return (
		<div>
			<ul className="divide-y divide-gray-200 dark:divide-gray-700">
				{prompts?.map((prompt) => (
					<li key={prompt._id}>
						<div className="flex items-center px-4 py-4">
							<div className="min-w-0 flex-1">
								<div className="min-w-0 flex-1">
									<p className="truncate font-medium text-gray-900 text-lg dark:text-white">
										{prompt.content}
									</p>
								</div>
								<div className="flex items-center space-x-4">
									<Link
										to="/admin/prompts/$id"
										params={{ id: prompt._id }}
										className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300"
									>
										Edit
									</Link>
								</div>
							</div>
						</div>
					</li>
				))}
				{prompts?.length === 0 && (
					<li className="px-4 py-4 text-center text-gray-500 dark:text-gray-400">
						No prompts found.
					</li>
				)}
			</ul>
		</div>
	);
}
