import { useAuthActions } from "@convex-dev/auth/react";
import {
	Dialog,
	DialogBackdrop,
	DialogPanel,
	TransitionChild,
} from "@headlessui/react";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import { api } from "@orhcestrator/backend/convex/_generated/api";
import type { Id } from "@orhcestrator/backend/convex/_generated/dataModel";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import ChatInterface from "@/components/chat-interface";
import LexicalEditorComponent from "@/components/lexical-editor";
import { UserProfileDropdown } from "@/components/UserProfileDropdown";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/{-$project}")({
	component: ChatComponent,
});

function ChatComponent() {
	const navigate = useNavigate();
	const { project: projectId } = Route.useParams();
	const { signIn, signOut } = useAuthActions();
	const { isLoading, isAuthenticated } = useConvexAuth();
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const user = useQuery(api.auth.loggedInUser, isAuthenticated ? {} : "skip");
	const projects = useQuery(api.projects.list, isAuthenticated ? {} : "skip");
	const projectPayload = useQuery(
		api.projects.single,
		isAuthenticated
			? {
					projectId: projectId as Id<"projects">,
				}
			: "skip",
	);

	useEffect(() => {
		if (
			projectPayload !== undefined &&
			!projectPayload?.project &&
			!!projectId
		) {
			navigate({ to: "/{-$project}", params: { project: undefined } });
		}
	}, [projectPayload?.project, projectId, projectPayload, navigate]);

	return (
		<div>
			<Outlet />
			<Dialog
				open={sidebarOpen}
				onClose={setSidebarOpen}
				className="relative z-50 lg:hidden"
			>
				<DialogBackdrop
					transition
					className="fixed inset-0 bg-gray-900/80 transition-opacity duration-300 ease-linear data-closed:opacity-0"
				/>

				<div className="fixed inset-0 flex">
					<DialogPanel
						transition
						className="data-closed:-translate-x-full relative mr-16 flex w-full max-w-xs flex-1 transform transition duration-300 ease-in-out"
					>
						<TransitionChild>
							<div className="absolute top-0 left-full flex w-16 justify-center pt-5 duration-300 ease-in-out data-closed:opacity-0">
								<button
									type="button"
									onClick={() => setSidebarOpen(false)}
									className="-m-2.5 p-2.5"
								>
									<span className="sr-only">Close sidebar</span>
									<XMarkIcon aria-hidden="true" className="size-6 text-white" />
								</button>
							</div>
						</TransitionChild>

						{/* Sidebar component, swap this element with another sidebar if you like */}
						<div className="relative flex grow flex-col gap-y-5 overflow-y-auto bg-white px-6 pb-2 dark:bg-gray-900 dark:before:pointer-events-none dark:before:absolute dark:before:inset-0 dark:before:border-white/10 dark:before:border-r dark:before:bg-black/10">
							<div className="relative flex h-16 shrink-0 items-center">
								<img
									alt="Your Company"
									src="https://tailwindcss.com/plus-assets/img/logos/mark.svg?color=indigo&shade=600"
									className="h-8 w-auto dark:hidden"
								/>
								<img
									alt="Your Company"
									src="https://tailwindcss.com/plus-assets/img/logos/mark.svg?color=indigo&shade=400"
									className="not-dark:hidden h-8 w-auto"
								/>
							</div>
							<nav className="relative flex flex-1 flex-col">
								<ul className="flex flex-1 flex-col gap-y-7">
									<li>
										<ul className="-mx-2 space-y-1">
											{projects?.map((item) =>
												item.isDefault ? null : (
													<li key={item._id} className="group relative">
														<a
															href={`/${item._id}`}
															className={cn(
																item._id === projectPayload?.project?._id
																	? "bg-gray-50 text-indigo-600 dark:bg-white/5 dark:text-white"
																	: "text-gray-700 hover:bg-gray-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white",
																"group flex gap-x-3 rounded-md p-2 pr-8 font-semibold text-sm/6",
															)}
														>
															{item.name}
														</a>
														<button
															type="button"
															onClick={(e) => {
																e.preventDefault();
																e.stopPropagation();
																navigate({
																	to: "/{-$project}/delete",
																	params: { project: projectId },
																	search: { target: item._id },
																});
															}}
															className="-translate-y-1/2 absolute top-1/2 right-2 rounded p-1 text-gray-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-white/10"
															aria-label={`Delete ${item.name}`}
															title="Delete project"
														>
															<XMarkIcon
																aria-hidden="true"
																className="size-4"
															/>
														</button>
													</li>
												),
											)}
										</ul>
									</li>
									<li className="-mx-2 mt-auto">
										<ul className="-mx-2 space-y-1">
											<li>
												<a
													href="https://orchestrator.to/privacy"
													target="_blank"
													className="group flex gap-x-3 rounded-md p-2 font-semibold text-gray-700 text-sm/6 hover:bg-gray-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
													rel="noopener"
												>
													Privacy Policy
												</a>
											</li>
											<li>
												<a
													href="https://orchestrator.to/terms"
													target="_blank"
													className="group flex gap-x-3 rounded-md p-2 font-semibold text-gray-700 text-sm/6 hover:bg-gray-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
													rel="noopener"
												>
													Terms of Service
												</a>
											</li>
										</ul>
									</li>
								</ul>
							</nav>
						</div>
					</DialogPanel>
				</div>
			</Dialog>

			{/* Static sidebar for desktop */}
			<div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
				{/* Sidebar component, swap this element with another sidebar if you like */}
				<div className="relative flex grow flex-col gap-y-5 overflow-y-auto border-gray-200 border-r bg-white px-6 dark:border-white/10 dark:bg-gray-900 dark:before:pointer-events-none dark:before:absolute dark:before:inset-0 dark:before:bg-black/10">
					<div className="relative flex h-16 shrink-0 items-center">
						<a href="/">
							<img alt="Orchestrator" src="/logo.svg" className="h-8 w-auto" />
						</a>
					</div>
					<nav className="relative flex flex-1 flex-col">
						<ul className="flex flex-1 flex-col gap-y-7">
							<li>
								<ul className="-mx-2 space-y-1">
									{projects?.map((item) =>
										item.isDefault ? null : (
											<li key={item._id} className="group relative">
												<a
													href={`/${item._id}`}
													className={cn(
														item._id === projectPayload?.project?._id
															? "bg-gray-50 text-indigo-600 dark:bg-white/5 dark:text-white"
															: "text-gray-700 hover:bg-gray-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white",
														"group flex gap-x-3 rounded-md p-2 pr-8 font-semibold text-sm/6",
													)}
												>
													{item.name}
												</a>
												<button
													type="button"
													onClick={(e) => {
														e.preventDefault();
														e.stopPropagation();
														navigate({
															to: "/{-$project}/delete",
															params: { project: projectId },
															search: { target: item._id },
														});
													}}
													className="-translate-y-1/2 absolute top-1/2 right-2 rounded p-1 text-gray-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-white/10"
													aria-label={`Delete ${item.name}`}
													title="Delete project"
												>
													<XMarkIcon aria-hidden="true" className="size-4" />
												</button>
											</li>
										),
									)}
								</ul>
							</li>
							<li className="-mx-2 mt-auto">
								<ul className="-mx-2 space-y-1">
									<li>
										<a
											href="https://orchestrator.to/privacy"
											target="_blank"
											className="group flex gap-x-3 rounded-md p-2 font-semibold text-gray-700 text-sm/6 hover:bg-gray-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
											rel="noopener"
										>
											Privacy Policy
										</a>
									</li>
									<li>
										<a
											href="https://orchestrator.to/terms"
											target="_blank"
											className="group flex gap-x-3 rounded-md p-2 font-semibold text-gray-700 text-sm/6 hover:bg-gray-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
											rel="noopener"
										>
											Terms of Service
										</a>
									</li>
								</ul>
								<UserProfileDropdown
									user={user}
									signOut={signOut}
									triggerClass="flex w-full items-center gap-x-3 rounded-md p-2 py-3 font-semibold text-gray-700 text-sm/6 hover:bg-gray-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
									showName={true}
									side="top"
									align="start"
								/>
							</li>
						</ul>
					</nav>
				</div>
			</div>

			<div className="sticky top-0 z-40 flex items-center gap-x-6 bg-white px-4 py-4 shadow-xs sm:px-6 lg:hidden dark:bg-gray-900 dark:shadow-none dark:before:pointer-events-none dark:before:absolute dark:before:inset-0 dark:before:border-white/10 dark:before:border-b dark:before:bg-black/10">
				<button
					type="button"
					onClick={() => setSidebarOpen(true)}
					className="-m-2.5 relative p-2.5 text-gray-700 lg:hidden dark:text-gray-400"
				>
					<span className="sr-only">Open sidebar</span>
					<Bars3Icon aria-hidden="true" className="size-6" />
				</button>
				<div className="relative flex-1 font-semibold text-gray-900 text-sm/6 dark:text-white">
					Dashboard
				</div>
				<UserProfileDropdown user={user} signOut={signOut} />
			</div>

			<main className="lg:pl-72">
				<div className="xl:pr-96">
					<div className="relative h-screen w-full pt-16 lg:pt-0">
						{isAuthenticated ? null : isLoading ? (
							<div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
								<div className="flex w-96 max-w-full flex-col items-center rounded-lg border border-gray-200 bg-white p-8 shadow-lg dark:border-gray-700 dark:bg-gray-800">
									<h2 className="text-center font-bold text-2xl text-gray-900 dark:text-white">
										Loading…
									</h2>
								</div>
							</div>
						) : (
							<div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
								<div className="flex w-96 max-w-full flex-col items-center rounded-lg border border-gray-200 bg-white p-8 shadow-lg dark:border-gray-700 dark:bg-gray-800">
									<h2 className="mb-4 text-center font-bold text-2xl text-gray-900 dark:text-white">
										Authenticate
									</h2>
									<button
										type="button"
										onClick={() => signIn("google")}
										className="cursor-pointer rounded-md bg-indigo-600 px-3.5 py-2.5 font-semibold text-sm text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2 dark:bg-indigo-500 dark:shadow-none dark:focus-visible:outline-indigo-500 dark:hover:bg-indigo-400"
									>
										<span>Sign in with Google</span>
									</button>
								</div>
							</div>
						)}
						<ChatInterface
							projectId={projectPayload?.project?._id}
							chatId={projectPayload?.chat?._id || "default"}
						/>
					</div>
				</div>
			</main>

			<aside className="fixed inset-y-0 right-0 hidden w-96 overflow-y-auto border-gray-200 border-l px-4 py-6 sm:px-6 lg:px-8 xl:block dark:border-white/10">
				<LexicalEditorComponent
					content={projectPayload?.project?.lexicalState}
				/>
			</aside>
		</div>
	);
}
