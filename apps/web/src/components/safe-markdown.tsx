import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

/**
 - Props for SafeMarkdown component
 - children: Markdown string to render
 - className: Optional container className
 - allowImages: Whether to render images (default false)
 */
export interface SafeMarkdownProps {
	children?: string | null;
	className?: string;
	allowImages?: boolean;
}

/* --------------------------------- Helpers -------------------------------- */

function safeHref(href?: string): string | undefined {
	if (!href) return undefined;
	const s = String(href).trim().toLowerCase();
	if (
		s.startsWith("http://") ||
		s.startsWith("https://") ||
		s.startsWith("mailto:") ||
		s.startsWith("tel:")
	) {
		return href;
	}
	return undefined;
}

function safeImgSrc(src?: string): string | undefined {
	if (!src) return undefined;
	const s = String(src).trim().toLowerCase();
	if (s.startsWith("http://") || s.startsWith("https://")) {
		return src;
	}
	return undefined;
}

/* components are defined inline in SafeMarkdown for proper type inference */

/* ------------------------------ SafeMarkdown ------------------------------ */

export function SafeMarkdown({
	children,
	className,
	allowImages = false,
}: SafeMarkdownProps) {
	const content = typeof children === "string" ? children : "";

	const components: Components = {
		a: ({ href, children, ...props }) => {
			const url = safeHref(typeof href === "string" ? href : undefined);
			if (!url) {
				return (
					<span className="cursor-not-allowed underline opacity-70">
						{children}
					</span>
				);
			}
			return (
				<a
					href={url}
					target="_blank"
					rel="noopener noreferrer nofollow"
					className="text-blue-600 underline hover:text-blue-700 dark:text-blue-400"
					{...props}
				>
					{children}
				</a>
			);
		},
		img: ({ src, alt, ...props }) => {
			if (!allowImages) return null;
			const safeSrc = safeImgSrc(typeof src === "string" ? src : undefined);
			if (!safeSrc) return null;
			return (
				<img
					src={safeSrc}
					alt={typeof alt === "string" ? alt : ""}
					loading="lazy"
					decoding="async"
					referrerPolicy="no-referrer"
					className="max-w-full rounded"
					{...props}
				/>
			);
		},
		code: ({ className, children, ...props }) => {
			return (
				<code
					className={[
						className || "",
						"rounded bg-gray-200 px-1 py-0.5 text-gray-900 dark:bg-gray-700 dark:text-gray-100",
					]
						.filter(Boolean)
						.join(" ")}
					{...props}
				>
					{children}
				</code>
			);
		},
		pre: ({ className, children, ...props }) => {
			return (
				<pre
					className={[
						className || "",
						"overflow-x-auto rounded bg-gray-100 p-3 dark:bg-gray-800",
					]
						.filter(Boolean)
						.join(" ")}
					{...props}
				>
					{children}
				</pre>
			);
		},
	};

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
