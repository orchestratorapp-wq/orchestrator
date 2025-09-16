import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface UserProfileDropdownProps {
	user?: { avatar_url?: string; name?: string } | null;
	signOut: () => void;
	triggerClass?: string;
	showName?: boolean;
	side?: "top" | "right" | "bottom" | "left";
	align?: "start" | "center" | "end";
}

export function UserProfileDropdown({
	user,
	signOut,
	triggerClass,
	showName = false,
	side = "bottom",
	align = "end",
}: UserProfileDropdownProps) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger className={triggerClass || "relative"}>
				<span className="sr-only">Your profile</span>
				<img
					alt=""
					src={
						user?.avatar_url ||
						`https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || "User")}&background=6366f1&color=fff`
					}
					className="-outline-offset-1 size-8 rounded-full bg-gray-50 outline outline-black/5 dark:bg-gray-800 dark:outline-white/10"
				/>
				{showName && <span aria-hidden="true">{user?.name || "-"}</span>}
			</DropdownMenuTrigger>
			<DropdownMenuContent side={side} align={align} className="w-52">
				<DropdownMenuLabel>{user?.name || "-"}</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={signOut}>Sign out</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
