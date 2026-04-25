import { createReactInlineContentSpec } from "@blocknote/react";

export const PageLinkInline = createReactInlineContentSpec(
  {
    type: "pageLink",
    propSchema: {
      pageId: {
        default: "",
      },
      pageTitle: {
        default: "Unknown Page",
      },
    },
    content: "none",
  },
  {
    render: (props) => {
      return (
        <span
          style={{
            cursor: "pointer",
            color: "var(--mantine-color-blue-6)",
            textDecoration: "underline",
            padding: "0 4px",
            backgroundColor: "var(--mantine-color-blue-0)",
            borderRadius: "4px",
            margin: "0 2px"
          }}
          onClick={(e) => {
            e.preventDefault();
            // We use a custom event to bubble the click out of the editor
            const event = new CustomEvent("polycanva-page-link-click", {
              detail: { pageId: props.inlineContent.props.pageId }
            });
            window.dispatchEvent(event);
          }}
        >
          📄 {props.inlineContent.props.pageTitle}
        </span>
      );
    },
  }
);
