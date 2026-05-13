"use client";

import React, { useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeShikiFromHighlighter from "@shikijs/rehype/core";
import { createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

// Pre-loaded themes + languages so the highlighter is fully synchronous.
// `react-markdown` runs its rehype pipeline via `runSync`, which rejects any
// plugin that returns a Promise — and the default `@shikijs/rehype` does
// exactly that (it lazily imports themes/langs). The canonical fix is to
// build the highlighter ahead of time with `createHighlighterCoreSync` and
// feed it to `@shikijs/rehype/core`. Visual output is identical.
import nord from "@shikijs/themes/nord";
import langBash from "@shikijs/langs/bash";
import langCss from "@shikijs/langs/css";
import langHtml from "@shikijs/langs/html";
import langJava from "@shikijs/langs/java";
import langJavascript from "@shikijs/langs/javascript";
import langJson from "@shikijs/langs/json";
import langMarkdown from "@shikijs/langs/markdown";
import langPython from "@shikijs/langs/python";
import langSql from "@shikijs/langs/sql";
import langTypescript from "@shikijs/langs/typescript";
import langYaml from "@shikijs/langs/yaml";

const highlighter = createHighlighterCoreSync({
  themes: [nord],
  langs: [
    langBash,
    langCss,
    langHtml,
    langJava,
    langJavascript,
    langJson,
    langMarkdown,
    langPython,
    langSql,
    langTypescript,
    langYaml,
  ],
  // JS engine: no WASM, works under `file://` in Safari, and is required
  // for the sync code path.
  engine: createJavaScriptRegexEngine(),
});

/**
 * MarkdownRenderer
 * ----------------
 * Used by ConversationPane to render chat message bodies.
 *
 * Pipeline:
 *   remark-gfm        -> tables, task lists, strikethrough, autolinks
 *   rehype-raw        -> allow raw HTML (we use <details> for "Thinking")
 *   @shikijs/rehype/core (sync) -> VS Code-grade syntax highlighting (Nord)
 *
 * Styling lives in `src/styles/markdown.css`, imported once from
 * `src/app/layout.tsx`. The stylesheet is scoped to `.markdown-body`,
 * has a transparent background (so the parent chat bubble's `bg-muted`
 * shows through), and applies a document-style Nord palette.
 */

type Props = {
  children: string;
  className?: string;
};

const components: Components = {
  // Make external links safe.
  a({ href, children, ...rest }) {
    const isExternal =
      typeof href === "string" && /^https?:\/\//i.test(href);
    return (
      <a
        href={href}
        {...(isExternal
          ? { target: "_blank", rel: "noopener noreferrer" }
          : {})}
        {...rest}
      >
        {children}
      </a>
    );
  },
  // Custom <details class="thinking"> rendering: when collapsed, show the
  // latest non-empty line from the body next to the "Thinking" label so the
  // user can peek at what the agent is currently doing without expanding.
  details(props) {
    const className =
      typeof props.className === "string" ? props.className : "";
    if (!className.split(/\s+/).includes("thinking")) {
      return <details {...props} />;
    }
    return <ThinkingDetails {...props} />;
  },
};

function ThinkingDetails(props: React.ComponentProps<"details">) {
  const [open, setOpen] = useState(false);
  const children = React.Children.toArray(props.children);

  // Split: pull out the <summary> child (if present), the rest is the body.
  let summaryContent: React.ReactNode = "Thinking";
  const bodyChildren: React.ReactNode[] = [];
  for (const child of children) {
    if (
      React.isValidElement(child) &&
      (child.type === "summary" || (typeof child.type === "string" && child.type === "summary"))
    ) {
      const props = child.props as { children?: React.ReactNode };
      summaryContent = props.children ?? "Thinking";
    } else if (typeof child === "string" && child.trim() === "") {
      // Skip whitespace-only text nodes between block elements.
    } else {
      bodyChildren.push(child);
    }
  }

  const latestLine = lastNonEmptyTextLine(bodyChildren);

  return (
    <details
      className="thinking"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary>
        <span className="thinking-label">{summaryContent}</span>
        {!open && latestLine && (
          <span className="thinking-latest">{latestLine}</span>
        )}
      </summary>
      <div className="thinking-body">{bodyChildren}</div>
    </details>
  );
}

/** Walks React children, returning the text of the last block-ish child. */
function lastNonEmptyTextLine(children: React.ReactNode[]): string {
  for (let i = children.length - 1; i >= 0; i--) {
    const text = getTextContent(children[i]).trim();
    if (text) return text;
  }
  return "";
}

function getTextContent(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getTextContent).join("");
  if (React.isValidElement(node)) {
    const childrenProp = (node.props as { children?: React.ReactNode }).children;
    return getTextContent(childrenProp);
  }
  return "";
}

export function MarkdownRenderer({ children, className }: Props) {
  return (
    <div className={`markdown-body ${className ?? ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          // rehype-raw must run BEFORE rehype-shiki so raw HTML (like
          // <details>) becomes part of the tree before code highlighting.
          rehypeRaw,
          [
            rehypeShikiFromHighlighter,
            highlighter,
            {
              theme: "nord",
              // Fall back gracefully for code fences with no/unknown language.
              fallbackLanguage: "text",
            },
          ],
        ]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

export default MarkdownRenderer;
