import { CodeHighlightNode, CodeNode } from "@lexical/code";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import { $convertFromMarkdownString, TRANSFORMERS } from "@lexical/markdown";
import type { InitialConfigType } from "@lexical/react/LexicalComposer";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { TableCellNode, TableNode, TableRowNode } from "@lexical/table";
import type {
	EditorState,
	LexicalEditor,
	SerializedEditorState,
} from "lexical";
import { useEffect, useRef, useState } from "react";

interface LexicalEditorProps {
	content?: string; // JSON string of lexical state
}

const editorConfig: InitialConfigType = {
	namespace: "LexicalEditor",
	nodes: [
		HeadingNode,
		ListNode,
		ListItemNode,
		QuoteNode,
		CodeNode,
		CodeHighlightNode,
		TableNode,
		TableCellNode,
		TableRowNode,
		LinkNode,
		AutoLinkNode,
	],
	theme: {
		paragraph: "mb-1",
		text: {
			bold: "font-bold",
			italic: "italic",
			underline: "underline",
		},
	},
	onError(error: Error) {
		throw error;
	},
	editable: false, // readonly by default
};

export default function LexicalEditorComponent({
	content,
}: LexicalEditorProps) {
	const [editor, setEditor] = useState<LexicalEditor | null>(null);
	const prevJsonRef = useRef<SerializedEditorState | null>(null);
	const [flashClass, setFlashClass] = useState("");

	useEffect(() => {
		if (editor && content) {
			let parsedState: EditorState | null = null;
			try {
				// Try to parse as Lexical JSON
				parsedState = editor.parseEditorState(content);
				editor.setEditorState(parsedState);
			} catch (_error) {
				try {
					editor.update(() => {
						$convertFromMarkdownString(content, TRANSFORMERS);
					});
				} catch {}
			}

			const newObj: SerializedEditorState = editor.getEditorState().toJSON();

			if (
				prevJsonRef.current &&
				JSON.stringify(newObj) !== JSON.stringify(prevJsonRef.current)
			) {
				setFlashClass("border-l-2 border-yellow-100");
				setTimeout(() => setFlashClass(""), 200);
			}

			prevJsonRef.current = newObj;
		}
	}, [editor, content]);

	return (
		<div className="h-full w-full p-4">
			<LexicalComposer initialConfig={editorConfig}>
				<div
					className={`relative min-h-[400px] p-4 ${flashClass} transition-all duration-200`}
				>
					<RichTextPlugin
						contentEditable={
							<ContentEditable className="prose prose-sm dark:prose-invert min-h-[350px] max-w-none break-words outline-none" />
						}
						placeholder={
							<div className="absolute top-4 left-4 text-gray-400">
								AI Result will appear here...
							</div>
						}
						ErrorBoundary={() => <div>Error loading content</div>}
					/>
					<HistoryPlugin />
					<OnChangePlugin onChange={() => {}} />
					<EditorRefPlugin editorRef={setEditor} />
				</div>
			</LexicalComposer>
		</div>
	);
}
