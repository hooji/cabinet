"use client";

import React, { useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import rehypeShikiFromHighlighter from "@shikijs/rehype/core";
import { createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import {
  bridgeFileId,
  useFileRegistry,
  type BridgeFile,
} from "@/stores/file-registry-store";

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
 *   remark-math       -> parses $inline$ and $$display$$ math
 *   remark-gfm        -> tables, task lists, strikethrough, autolinks
 *   rehype-raw        -> allow raw HTML (we use <details>, <iframe> etc.)
 *   rehype-katex      -> renders math to HTML (KaTeX)
 *   @shikijs/rehype/core (sync) -> VS Code-grade syntax highlighting (Nord)
 *
 * Custom URL scheme: `bridge://file/<id>` references a file that the agent
 * pushed via `onFileAvailable`. The img/iframe/embed overrides below
 * resolve these through the file-registry store.
 *
 * Styling lives in `src/styles/markdown.css`, imported once from
 * `src/app/layout.tsx`.
 */

type Props = {
  children: string;
  className?: string;
};

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
  img(props) {
    return <BridgeImg {...props} />;
  },
  iframe(props) {
    return <BridgeIframe {...props} />;
  },
  embed(props) {
    return <BridgeEmbed {...props} />;
  },
  details(props) {
    const className =
      typeof props.className === "string" ? props.className : "";
    if (!className.split(/\s+/).includes("thinking")) {
      return <details {...props} />;
    }
    return <ThinkingDetails {...props} />;
  },
};

// ─── bridge:// resolution for img / iframe / embed ────────────────────

/** Subscribe to a file by id; component re-renders when it lands. */
function useBridgeFile(id: string | null): BridgeFile | undefined {
  // Touch `version` so any change to the registry re-evaluates the lookup.
  useFileRegistry((s) => s.version);
  return useFileRegistry((s) => (id ? s.files.get(id) : undefined));
}

// react-markdown 10 passes a `node` (hast node) prop alongside the standard
// HTML attributes; spreading it straight onto the DOM yields a stray
// `node="[object Object]"` attribute. Strip it from every override.
type WithNode<P> = P & { node?: unknown };

function stripNode<P extends object>(props: WithNode<P>): P {
  const { node: _node, ...rest } = props;
  return rest as P;
}

function BridgeImg(rawProps: WithNode<React.ImgHTMLAttributes<HTMLImageElement>>) {
  const props = stripNode(rawProps);
  const id = bridgeFileId(typeof props.src === "string" ? props.src : null);
  const file = useBridgeFile(id);
  if (id === null) return <img {...props} alt={props.alt ?? ""} />;
  if (!file) {
    return (
      <span className="bridge-file-pending" aria-label={`waiting for ${id}`}>
        [image pending]
      </span>
    );
  }
  return <img {...props} src={file.objectUrl} alt={props.alt ?? file.name ?? ""} />;
}

function BridgeIframe(rawProps: WithNode<React.IframeHTMLAttributes<HTMLIFrameElement>>) {
  const props = stripNode(rawProps);
  const id = bridgeFileId(typeof props.src === "string" ? props.src : null);
  const file = useBridgeFile(id);
  if (id === null) return <iframe {...props} title={props.title ?? ""} />;
  if (!file) {
    return (
      <span className="bridge-file-pending" aria-label={`waiting for ${id}`}>
        [file pending]
      </span>
    );
  }
  return (
    <iframe
      {...props}
      src={file.objectUrl}
      title={props.title ?? file.name ?? id}
    />
  );
}

function BridgeEmbed(rawProps: WithNode<React.EmbedHTMLAttributes<HTMLEmbedElement>>) {
  const props = stripNode(rawProps);
  const id = bridgeFileId(typeof props.src === "string" ? props.src : null);
  const file = useBridgeFile(id);
  if (id === null) return <embed {...props} />;
  if (!file) {
    return (
      <span className="bridge-file-pending" aria-label={`waiting for ${id}`}>
        [file pending]
      </span>
    );
  }
  return <embed {...props} src={file.objectUrl} type={props.type ?? file.mimeType} />;
}

// ─── ThinkingDetails: collapsible "Thinking" section ──────────────────

function ThinkingDetails(props: React.ComponentProps<"details">) {
  const [open, setOpen] = useState(false);
  const children = React.Children.toArray(props.children);

  let summaryContent: React.ReactNode = "Thinking";
  const bodyChildren: React.ReactNode[] = [];
  for (const child of children) {
    if (
      React.isValidElement(child) &&
      (child.type === "summary" || (typeof child.type === "string" && child.type === "summary"))
    ) {
      const inner = (child.props as { children?: React.ReactNode }).children;
      summaryContent = inner ?? "Thinking";
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
        // Default urlTransform sanitizes unknown schemes (it strips
        // bridge://… URLs to empty strings to prevent XSS from
        // user-generated markdown). The agent backend is trusted in this
        // app, so pass URLs through untouched.
        urlTransform={(url) => url}
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[
          // rehype-raw must run before rehype-shiki so raw HTML (like
          // <details> / <iframe>) becomes part of the tree before code
          // highlighting. rehype-katex renders math nodes.
          rehypeRaw,
          rehypeKatex,
          [
            rehypeShikiFromHighlighter,
            highlighter,
            {
              theme: "nord",
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
