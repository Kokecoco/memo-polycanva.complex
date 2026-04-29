import { useMemo } from "react";
import type { Block } from "@blocknote/core";

export interface HeadingItem {
  id: string;
  level: number;
  text: string;
  block: Block;
}

export function TableOfContents({
  content,
  onItemClick,
}: {
  content: string;
  onItemClick: (blockId: string) => void;
}) {
  type HeadingBlock = Block & {
    content?: unknown;
    props?: unknown;
  };

  const headings = useMemo(() => {
    try {
      const blocks = JSON.parse(content) as HeadingBlock[];
      if (!Array.isArray(blocks)) return [];

      return blocks
        .filter((block) => block.type === "heading")
        .map((block) => {
          // Extract text from inline content
          const text = Array.isArray(block.content)
            ? block.content
                .map((item) => {
                  if (typeof item === "string") {
                    return item;
                  }
                  if (item && typeof item === "object" && "text" in item) {
                    const maybeText = (item as { text?: unknown }).text;
                    return typeof maybeText === "string" ? maybeText : "";
                  }
                  return "";
                })
                .join("")
            : "";
          const props = block.props && typeof block.props === "object" ? block.props as { level?: unknown } : {};
          const level = typeof props.level === "number" ? props.level : 1;
          
          return {
            id: block.id,
            level,
            text: text || "無題の見出し",
            block,
          } as HeadingItem;
        });
    } catch {
      return [];
    }
  }, [content]);

  if (headings.length === 0) {
    return (
      <div className="toc-empty">
        <p>見出しがありません</p>
      </div>
    );
  }

  const handleHeadingClick = (id: string) => {
    window.dispatchEvent(new CustomEvent("polycanva-scroll-to-block", { detail: { blockId: id } }));
    if (onItemClick) onItemClick(id);
  };

  return (
    <div className="toc-container">
      <div className="toc-header">
        <h3>アウトライン</h3>
      </div>
      <nav className="toc-list">
        {headings.map((heading) => (
          <button
            key={heading.id}
            className={`toc-item level-${heading.level}`}
            onClick={() => handleHeadingClick(heading.id)}
            title={heading.text}
          >
            {heading.text}
          </button>
        ))}
      </nav>
    </div>
  );
}
