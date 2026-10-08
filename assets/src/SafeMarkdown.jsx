import React from "react";

/**
 * Sanitized markdown-ish renderer for public content (no deps, no raw HTML).
 *
 * Main feed PostCard renders plain text today — there is no shared feed markdown
 * component to reuse. This module extracts and extends the lightweight renderer
 * previously inlined in PublicSite.jsx so /u (and PublicSite) share one path.
 *
 * Supported: paragraphs (newline-preserving), #/##/### headings, hr,
 * unordered (- ) and ordered (1. ) lists, **bold**, *italic*,
 * [label](url), bare http(s) URLs. Links open in a new tab with
 * rel="noopener noreferrer nofollow ugc". utm_* query params are stripped from
 * hrefs for display only.
 */

const LINK_REL = "noopener noreferrer nofollow ugc";

/** Strip utm_* query params from a URL string (display only). */
export function stripUtmParams(href) {
  const raw = String(href || "");
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return raw;
    }
    const keys = [...u.searchParams.keys()];
    let changed = false;
    for (const k of keys) {
      if (k.toLowerCase().startsWith("utm_")) {
        u.searchParams.delete(k);
        changed = true;
      }
    }
    if (!changed) return u.toString();
    // Prefer compact form when search becomes empty
    return u.searchParams.toString() ? u.toString() : `${u.origin}${u.pathname}${u.hash}`;
  } catch {
    return raw;
  }
}

function isSafeHttpUrl(href) {
  try {
    const u = new URL(String(href || "").trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function LinkEl({ href, children }) {
  const cleaned = stripUtmParams(href);
  if (!isSafeHttpUrl(cleaned)) {
    return <>{children}</>;
  }
  return (
    <a href={cleaned} target="_blank" rel={LINK_REL}>
      {children}
    </a>
  );
}

/** Parse inline markdown into React nodes (text only — never HTML). */
function renderInline(text, keyPrefix = "i") {
  const src = String(text || "");
  const nodes = [];
  // Order: [label](url) | **bold** | *italic* | bare URL
  const re =
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|(https?:\/\/[^\s<>"']+)/g;
  let last = 0;
  let m;
  let n = 0;
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) {
      nodes.push(src.slice(last, m.index));
    }
    const k = `${keyPrefix}-${n++}`;
    if (m[1] != null && m[2] != null) {
      nodes.push(
        <LinkEl key={k} href={m[2]}>
          {m[1]}
        </LinkEl>
      );
    } else if (m[3] != null) {
      nodes.push(<strong key={k}>{m[3]}</strong>);
    } else if (m[4] != null) {
      nodes.push(<em key={k}>{m[4]}</em>);
    } else if (m[5] != null) {
      const url = m[5].replace(/[.,;:!?)]+$/, "");
      const trail = m[5].slice(url.length);
      nodes.push(
        <LinkEl key={k} href={url}>
          {stripUtmParams(url)}
        </LinkEl>
      );
      if (trail) nodes.push(trail);
    }
    last = m.index + m[0].length;
  }
  if (last < src.length) nodes.push(src.slice(last));
  return nodes.length ? nodes : src;
}

function matchUnordered(t) {
  const m = String(t).match(/^[-*]\s+(.+)$/);
  return m ? m[1] : null;
}

function matchOrdered(t) {
  const m = String(t).match(/^\d+\.\s+(.+)$/);
  return m ? m[1] : null;
}

/**
 * Block-level markdown renderer.
 * @param {string} body
 * @param {{ className?: string }} [opts]
 */
export default function SafeMarkdown({ body, className }) {
  if (body == null || body === "") return null;
  const lines = String(body).split("\n");
  const blocks = [];
  let para = [];
  let listKind = null; // "ul" | "ol" | null
  let listItems = [];

  const flushPara = () => {
    if (!para.length) return;
    const text = para.join("\n").trim();
    if (text) {
      blocks.push(
        <p key={`p-${blocks.length}`} className="ice-md-p">
          {renderInline(text, `p${blocks.length}`)}
        </p>
      );
    }
    para = [];
  };

  const flushList = () => {
    if (!listKind || !listItems.length) {
      listKind = null;
      listItems = [];
      return;
    }
    const Tag = listKind === "ol" ? "ol" : "ul";
    const cls = listKind === "ol" ? "ice-md-ol" : "ice-md-ul";
    const keyBase = blocks.length;
    blocks.push(
      <Tag key={`list-${keyBase}`} className={cls}>
        {listItems.map((item, idx) => (
          <li key={`li-${keyBase}-${idx}`} className="ice-md-li">
            {renderInline(item, `li${keyBase}-${idx}`)}
          </li>
        ))}
      </Tag>
    );
    listKind = null;
    listItems = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (!t) {
      flushList();
      flushPara();
      continue;
    }
    if (t === "---" || t === "***") {
      flushList();
      flushPara();
      blocks.push(<hr key={`hr-${blocks.length}`} className="ice-md-hr" />);
      continue;
    }
    if (t.startsWith("### ")) {
      flushList();
      flushPara();
      blocks.push(
        <h3 key={`h3-${blocks.length}`} className="ice-md-h3">
          {renderInline(t.slice(4), `h3${blocks.length}`)}
        </h3>
      );
      continue;
    }
    if (t.startsWith("## ")) {
      flushList();
      flushPara();
      blocks.push(
        <h2 key={`h2-${blocks.length}`} className="ice-md-h2">
          {renderInline(t.slice(3), `h2${blocks.length}`)}
        </h2>
      );
      continue;
    }
    if (t.startsWith("# ")) {
      flushList();
      flushPara();
      blocks.push(
        <h1 key={`h1-${blocks.length}`} className="ice-md-h1">
          {renderInline(t.slice(2), `h1${blocks.length}`)}
        </h1>
      );
      continue;
    }

    const ulItem = matchUnordered(t);
    const olItem = matchOrdered(t);
    if (ulItem != null || olItem != null) {
      flushPara();
      const kind = ulItem != null ? "ul" : "ol";
      const item = ulItem != null ? ulItem : olItem;
      if (listKind && listKind !== kind) flushList();
      listKind = kind;
      listItems.push(item);
      continue;
    }

    flushList();
    para.push(t);
  }
  flushList();
  flushPara();

  if (!blocks.length) {
    return (
      <div className={className || undefined}>
        <p className="ice-md-p">{renderInline(String(body))}</p>
      </div>
    );
  }

  return <div className={className || undefined}>{blocks}</div>;
}
