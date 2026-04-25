import { useMemo } from "react";
import {
  BlockNoteSchema,
  createCodeBlockSpec,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
} from "@blocknote/core";
import type { PartialBlock } from "@blocknote/core";
import {
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  useCreateBlockNote,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import * as locales from "@blocknote/core/locales";
import { createHighlighter } from "../shiki.bundle.ts";
import { DatabaseBlock } from "./DatabaseBlock.tsx";
import { CalendarBlock } from "./CalendarBlock.tsx";
import { PageLinkInline } from "./PageLinkInline.tsx";
import dayjs from "dayjs";
import { IconDatabase, IconCalendar, IconClock, IconLink } from "@tabler/icons-react";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

const codeBlockSupportedLanguages: Record<string, { name: string; aliases?: string[] }> = {
  text: { name: "Plain Text", aliases: ["plaintext", "txt"] },
  javascript: { name: "JavaScript", aliases: ["js"] },
  typescript: { name: "TypeScript", aliases: ["ts"] },
  jsx: { name: "JSX" },
  tsx: { name: "TSX" },
  json: { name: "JSON" },
  html: { name: "HTML" },
  css: { name: "CSS" },
  bash: { name: "Bash", aliases: ["sh", "shell", "zsh"] },
  markdown: { name: "Markdown", aliases: ["md"] },
  yaml: { name: "YAML", aliases: ["yml"] },
  sql: { name: "SQL" },
  python: { name: "Python", aliases: ["py"] },
  go: { name: "Go" },
  rust: { name: "Rust", aliases: ["rs"] },
  java: { name: "Java" },
};

const codeBlockHighlighterPromise = createHighlighter({
  themes: ["one-dark-pro"],
  langs: Object.keys(codeBlockSupportedLanguages).filter((language) => language !== "text"),
});

const customSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    codeBlock: createCodeBlockSpec({
      supportedLanguages: codeBlockSupportedLanguages,
      createHighlighter: () => codeBlockHighlighterPromise,
    }),
    database: DatabaseBlock(),
    calendar: CalendarBlock(),
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    pageLink: PageLinkInline,
  },
});

const defaultContent: PartialBlock[] = [
  {
    type: "paragraph",
    content: "",
  },
];

function parseContent(raw: string): PartialBlock[] {
  if (!raw) {
    return defaultContent;
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PartialBlock[]) : defaultContent;
  } catch {
    return defaultContent;
  }
}

const insertDatabase = (editor: typeof customSchema.BlockNoteEditor) => ({
  title: "Database",
  onItemClick: () => {
    editor.insertBlocks([{ type: "database" as any }], editor.getTextCursorPosition().block, "after");
  },
  aliases: ["db", "database", "テーブル", "データベース"],
  group: "Custom Blocks",
  icon: <IconDatabase size={18} />,
  subtext: "Insert a database table.",
});

const insertCalendar = (editor: typeof customSchema.BlockNoteEditor) => ({
  title: "Calendar",
  onItemClick: () => {
    editor.insertBlocks([{ type: "calendar" as any }], editor.getTextCursorPosition().block, "after");
  },
  aliases: ["calendar", "カレンダー", "予定"],
  group: "Custom Blocks",
  icon: <IconCalendar size={18} />,
  subtext: "Insert a calendar view.",
});

const insertTimestamp = (editor: typeof customSchema.BlockNoteEditor) => ({
  title: "Date / Time",
  onItemClick: () => {
    const timeStr = dayjs().format("YYYY-MM-DD HH:mm");
    editor.insertInlineContent([
      {
        type: "text",
        text: timeStr,
        styles: { bold: true },
      },
    ]);
  },
  aliases: ["date", "time", "日付", "時間", "now"],
  group: "Custom Blocks",
  icon: <IconClock size={18} />,
  subtext: "Insert current date and time.",
});

export function CustomEditor({
  content,
  onContentChange,
  pages,
}: {
  content: string;
  onContentChange: (content: string) => void;
  pages: Record<string, { id: string; title: string; isTrashed?: boolean }>;
}) {
  const initialContent = useMemo(() => parseContent(content), [content]);
  const editor = useCreateBlockNote({
    schema: customSchema,
    initialContent,
    dictionary: locales.ja,
  });

  const getMentionMenuItems = (editor: typeof customSchema.BlockNoteEditor) => {
    const items = Object.values(pages)
      .filter((p) => !p.isTrashed)
      .map((p) => ({
        title: p.title || "無題のページ",
        onItemClick: () => {
          editor.insertInlineContent([
            {
              type: "pageLink",
              props: {
                pageId: p.id,
                pageTitle: p.title || "無題のページ",
              },
            },
            {
              type: "text",
              text: " ",
              styles: {},
            },
          ]);
        },
        aliases: [p.id],
        group: "Pages",
        icon: <IconLink size={18} />,
        subtext: "Link to this page",
      }));
    return items;
  };

  return (
    <BlockNoteView
      editor={editor}
      onChange={() => {
        onContentChange(JSON.stringify(editor.document));
      }}
      slashMenu={false}
      sideMenu
      formattingToolbar
      className="editor-custom-style"
    >
      <SuggestionMenuController
        triggerCharacter="/"
        getItems={async (query) => {
          const defaultItems = getDefaultReactSlashMenuItems(editor);
          const customItems = [
            insertDatabase(editor),
            insertCalendar(editor),
            insertTimestamp(editor),
          ];
          const all = [...defaultItems, ...customItems];
          if (!query) return all;
          const q = query.toLowerCase();
          return all.filter((item) => {
            const matchesTitle = item.title.toLowerCase().includes(q);
            const matchesAlias = item.aliases?.some((a) => a.toLowerCase().includes(q));
            return matchesTitle || matchesAlias;
          });
        }}
      />
      <SuggestionMenuController
        triggerCharacter="@"
        getItems={async (query) => {
          const items = getMentionMenuItems(editor);
          if (!query) return items;
          const q = query.toLowerCase();
          return items.filter((item) => item.title.toLowerCase().includes(q));
        }}
      />
    </BlockNoteView>
  );
}
