"use client";

import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
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

// Component overrides are deliberately minimal. The previous in-bubble
// renderer used a dense map of Tailwind classes to compress chat
// typography; we've moved to a document look, so styling is all in CSS.
// The only override here makes external links safe.
const components: Components = {
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
};

export function MarkdownRenderer({ children, className }: Props) {
  return (
    <div className={`markdown-body ${className ?? ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
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
