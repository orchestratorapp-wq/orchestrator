import { Dialog, DialogBackdrop, DialogPanel } from "@headlessui/react";
import { api } from "@orhcestrator/backend/convex/_generated/api";
import type { Id } from "@orhcestrator/backend/convex/_generated/dataModel";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/{-$project}/delete")({
	component: DeleteProjectModal,
});

function DeleteProjectModal() {
	const navigate = useNavigate();
	const { project: currentProject } = Route.useParams();
	const search = Route.useSearch() as { target?: string };
	const targetId = (search?.target || null) as Id<"projects"> | null;

	const { isAuthenticated } = useConvexAuth();
	const projectData = useQuery(
		api.projects.single,
		isAuthenticated && targetId ? { projectId: targetId } : "skip",
	);

	const removeProject = useMutation(api.projects.remove);

	const [isDeleting, setIsDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!targetId) {
			navigate({ to: "/{-$project}", params: { project: currentProject } });
		}
	}, [targetId, navigate, currentProject]);

	const onClose = () =>
		navigate({ to: "/{-$project}", params: { project: currentProject } });

	const onConfirm = async () => {
		if (!targetId) return;

		setIsDeleting(true);
		setError(null);

		try {
			// Backend mutation will cascade delete chats and messages for this project
			await removeProject({ projectId: targetId });

			const params: { project?: string } = { project: currentProject };
			if (currentProject === targetId) {
				// If the deleted project is currently selected, reset to default view
				params.project = undefined;
			}

			navigate({ to: "/{-$project}", params });
		} catch (e: any) {
			setError(e?.message || "Failed to delete project.");
			setIsDeleting(false);
		}
	};

	const name = projectData?.project?.name;

	return (
		<Dialog open={true} onClose={onClose} className="relative z-50">
			<DialogBackdrop
				transition
				className="fixed inset-0 bg-gray-900/80 transition-opacity duration-300 ease-linear data-closed:opacity-0"
			/>
			<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
				<DialogPanel className="relative w-full max-w-md transform overflow-hidden rounded-lg bg-white p-6 text-left shadow-xl transition-all dark:border dark:border-white/10 dark:bg-gray-900">
					<h2 className="mb-2 font-semibold text-gray-900 text-lg dark:text-white">
						Delete project
					</h2>
					<p className="mb-4 text-gray-600 text-sm dark:text-gray-300">
						Are you sure you want to delete{" "}
						{name ? (
							<span className="font-medium">"{name}"</span>
						) : (
							"this project"
						)}
						? This action is irreversible. All chats and messages in this
						project will be permanently deleted.
					</p>
					{error ? <p className="mb-3 text-red-600 text-sm">{error}</p> : null}
					<div className="mt-4 flex justify-end gap-3">
						<button
							type="button"
							onClick={onClose}
							disabled={isDeleting}
							className="rounded-md px-3 py-2 font-semibold text-gray-700 text-sm hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/10"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={onConfirm}
							disabled={isDeleting || !targetId}
							className="rounded-md bg-red-600 px-3 py-2 font-semibold text-sm text-white hover:bg-red-500 disabled:opacity-50"
						>
							{isDeleting ? "Deleting…" : "Delete"}
						</button>
					</div>
				</DialogPanel>
			</div>
		</Dialog>
	);
}
