import { useAuthToken } from "@convex-dev/auth/react";
import { api } from "@orhcestrator/backend/convex/_generated/api";
import type { Id } from "@orhcestrator/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ChatInterfaceProps {
	chatId: string;
}

export default function ChatInterface({ chatId }: ChatInterfaceProps) {
	const token = useAuthToken();
	const [message, setMessage] = useState("");
	const messagesEndRef = useRef<HTMLDivElement>(null);

	// Query messages for the current chat
	const messages = useQuery(api.messages.list, {
		chatId: chatId as Id<"chats">,
	});

	// Mutation to send message
	const sendMessage = useMutation(api.messages.send);

	const messagesCount = messages?.length || 0;

	useEffect(() => {
		if (messagesCount > 0) {
			messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
		}
	}, [messagesCount]);

	const handleSend = () => {
		if (!message.trim()) return;
		sendMessage({
			chatId: chatId as Id<"chats">,
			content: message,
		});
		setMessage("");
	};

	return (
		<div className="flex h-full flex-col bg-white dark:bg-gray-900">
			{/* Chat Header */}
			<div className="border-b p-4">
				<h2 className="font-semibold text-lg">Current Chat</h2>
			</div>

			{/* Messages */}
			<div className="flex-1 space-y-4 overflow-y-auto p-4">
				{!messages ? (
					<div className="mt-8 text-center text-gray-500">
						Loading messages...
					</div>
				) : messages.length === 0 ? (
					<div className="mt-8 text-center text-gray-500">
						No messages yet. Start a conversation!
					</div>
				) : (
					messages.map((msg) => (
						<div
							key={msg._id}
							className={`rounded-lg p-3 ${
								msg.role === "user"
									? "ml-auto bg-blue-100 dark:bg-blue-900"
									: "mr-auto bg-gray-100 dark:bg-gray-800"
							}`}
							style={{ maxWidth: "70%" }}
						>
							<div className="mb-1 text-gray-500 text-sm">
								{msg.role === "user" ? "You" : "AI"}
							</div>
							<div>{msg.content}</div>
						</div>
					))
				)}
				<div ref={messagesEndRef} />
			</div>

			{/* Input */}
			<div className="border-t p-4">
				<div className="flex gap-2">
					<Input
						disabled={!token}
						value={message}
						onChange={(e) => setMessage(e.target.value)}
						placeholder="Type your message..."
						onKeyDown={(e) => {
							if (e.key === "Enter") handleSend();
						}}
						className="flex-1"
					/>
					<Button
						onClick={handleSend}
						disabled={!token || !message.trim()}
						type="button"
					>
						<Send size={16} />
					</Button>
				</div>
			</div>
		</div>
	);
}
