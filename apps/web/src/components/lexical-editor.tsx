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
import type { LexicalEditor } from "lexical";
import { useEffect, useState } from "react";

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
	useEffect(() => {
		if (editor && content) {
			try {
				// Try to parse as Lexical JSON
				const parsedState = editor.parseEditorState(content);
				editor.setEditorState(parsedState);
			} catch {
				try {
					editor.update(() => {
						$convertFromMarkdownString(content, TRANSFORMERS);
					});
				} catch {}
			}
		}
	}, [editor, content]);

	return (
		<div className="h-full w-full p-4">
			<LexicalComposer initialConfig={editorConfig}>
				<div className="relative min-h-[400px] p-4">
					<RichTextPlugin
						contentEditable={
							<ContentEditable className="min-h-[350px] outline-none" />
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
