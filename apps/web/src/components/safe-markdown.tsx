import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

export interface SafeMarkdownProps {
	children?: string | null;
	className?: string;
	/**
	 * When true, images are allowed (still sanitized by rehype-sanitize).
	 * When false (default), images are not rendered.
	 */
	allowImages?: boolean;
}

/**
 * SafeMarkdown renders user-supplied Markdown safely:
 * - GitHub-flavored Markdown via remark-gfm.
 * - Raw HTML disabled (skipHtml).
 * - Sanitization via rehype-sanitize (default schema).
 * - Minimal overrides:
 *   - Anchor tag: open safely in a new tab.
 *   - Conditional image blocking: off by default.
 */
export function SafeMarkdown({
	children,
	className,
	allowImages = false,
}: SafeMarkdownProps) {
	const content = children ?? "";

	const components: Components = {
		a: ({ children: nodeChildren, ...props }) => (
			<a target="_blank" rel="noopener noreferrer nofollow" {...props}>
				{nodeChildren}
			</a>
		),
	};

	if (!allowImages) {
		components.img = () => null;
	}

	return (
		<div
			className={[
				"prose prose-sm dark:prose-invert max-w-none break-words",
				className || "",
			]
				.filter(Boolean)
				.join(" ")}
		>
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				rehypePlugins={[rehypeSanitize]}
				skipHtml={true}
				components={components}
			>
				{content}
			</ReactMarkdown>
		</div>
	);
}

export default SafeMarkdown;
