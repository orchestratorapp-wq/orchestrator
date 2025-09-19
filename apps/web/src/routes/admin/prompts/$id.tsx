import { api } from "@orhcestrator/backend/convex/_generated/api";
import type { Id } from "@orhcestrator/backend/convex/_generated/dataModel";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { startCase } from "es-toolkit/string";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/admin/prompts/$id")({
	component: EditPrompt,
});

function EditPrompt() {
	const { id } = Route.useParams();
	const navigate = useNavigate();
	const createMutation = useMutation(api.prompts.create);
	const updateMutation = useMutation(api.prompts.update);

	const [content, setContent] = useState("");
	const [type, setType] = useState("");
	const [subType, setSubType] = useState("");
	const [model, setModel] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const typeOptions = ["daily_planner"];
	const subTypeOptions = ["system"];
	const modelOptions = ["gpt-5", "gpt-5-nano"];

	const isNew = id === "new";
	const prompt = useQuery(
		api.prompts.get,
		isNew ? "skip" : { promptId: id as Id<"prompts"> },
	);

	useEffect(() => {
		if (prompt) {
			setContent(prompt.content);
			setType(prompt.type || "");
			setSubType(prompt.subType || "");
			setModel(prompt.model || "");
		} else if (isNew) {
			// Reset for new
			setContent("");
			setType("");
			setSubType("");
			setModel("");
		}
	}, [prompt, isNew]);

	if (!isNew && !prompt) {
		return <div>Prompt not found.</div>;
	}

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsSubmitting(true);

		try {
			if (isNew) {
				await createMutation({
					content,
					type: type || undefined,
					subType: subType || undefined,
				});
			} else {
				await updateMutation({
					promptId: id as Id<"prompts">,
					content,
					type: type || undefined,
					subType: subType || undefined,
				});
			}
			navigate({ to: "/admin/prompts" });
		} catch (error) {
			console.error("Error saving prompt:", error);
			alert("Error saving prompt");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div>
			<div className="flex flex-1 flex-col">
				<main className="flex-1 overflow-y-auto py-6">
					<div className="mx-auto max-w-2xl">
						<form onSubmit={handleSubmit} className="space-y-6">
							<div>
								<label
									htmlFor="content"
									className="block font-medium text-gray-700 text-sm dark:text-gray-300"
								>
									Content
								</label>
								<textarea
									rows={10}
									value={content}
									onChange={(e) => setContent(e.target.value)}
									required
									className="mt-1 block w-full rounded-md border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
								/>
							</div>

							<div>
								<label
									htmlFor="type"
									className="block font-medium text-gray-700 text-sm dark:text-gray-300"
								>
									Type
								</label>
								<select
									value={type}
									onChange={(e) => setType(e.target.value)}
									className="mt-1 block w-full rounded-md border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
								>
									<option value="">-- Select Type --</option>
									{typeOptions.map((option) => (
										<option key={option} value={option}>
											{startCase(option)}
										</option>
									))}
								</select>
							</div>

							<div>
								<label
									htmlFor="subType"
									className="block font-medium text-gray-700 text-sm dark:text-gray-300"
								>
									Sub Type
								</label>
								<select
									value={subType}
									onChange={(e) => setSubType(e.target.value)}
									className="mt-1 block w-full rounded-md border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
								>
									<option value="">-- Select Sub Type --</option>
									{subTypeOptions.map((option) => (
										<option key={option} value={option}>
											{startCase(option)}
										</option>
									))}
								</select>
							</div>

							<div>
								<label
									htmlFor="subType"
									className="block font-medium text-gray-700 text-sm dark:text-gray-300"
								>
									LLM
								</label>
								<select
									value={model}
									onChange={(e) => setModel(e.target.value)}
									className="mt-1 block w-full rounded-md border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
								>
									<option value="">-- Select Model --</option>
									{modelOptions.map((option) => (
										<option key={option} value={option}>
											{startCase(option)}
										</option>
									))}
								</select>
							</div>

							<div className="flex justify-end space-x-4">
								<Link
									to="/admin/prompts"
									className="rounded-md border border-gray-300 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
								>
									Cancel
								</Link>
								<button
									type="submit"
									disabled={isSubmitting}
									className="rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-500 disabled:opacity-50"
								>
									{isSubmitting ? "Saving..." : "Save"}
								</button>
							</div>
						</form>
					</div>
				</main>
			</div>
		</div>
	);
}
