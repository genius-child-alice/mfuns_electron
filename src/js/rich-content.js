import { marked } from '../../node_modules/marked/lib/marked.esm.js';
import DOMPurify from '../../node_modules/dompurify/dist/purify.es.mjs';
import { mediaSrcForRichImage, resolveCoverUrl, resolveRichImageUrl } from './content-api.js';
import { mediaSrcForStickerKey } from './emoji-pack.js';

/**
 * @param {string | null | undefined} value
 */
/**
 * @param {string | null} alt
 * @param {string | null} src
 */
function stickerKeyFromImg(alt, src) {
  if (alt) {
    const trimmed = alt.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const key = trimmed.slice(1, -1).trim();
      if (key) return key;
    }
  }
  if (src) {
    try {
      const segments = new URL(src).pathname.split('/').filter(Boolean);
      if (segments.length >= 2) {
        const id = segments[segments.length - 1].replace(/\.[^.]+$/, '');
        return `${segments[segments.length - 2]}-${id}`;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

function safeHttpUri(value) {
  const raw = `${value ?? ''}`.trim();
  if (!raw) return null;
  const normalized = raw.startsWith('//') ? `https:${raw}` : raw;
  try {
    const uri = new URL(normalized);
    if (uri.protocol !== 'http:' && uri.protocol !== 'https:') return null;
    return uri.toString();
  } catch {
    return null;
  }
}

/**
 * @param {unknown} value
 */
function asAttributes(value) {
  return value && typeof value === 'object' ? /** @type {Record<string, unknown>} */ (value) : {};
}

/**
 * @param {string} text
 * @param {Record<string, unknown>} attributes
 */
function escapeHtmlText(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {string} userId
 * @param {string} displayName
 */
const BRACKET_MENTION_RE = /\[@(\d*):?([^\]]+)\]/g;

function mentionMarkdownToken(userId, displayName) {
  const name = displayName.startsWith('@') ? displayName : `@${displayName}`;
  const id = `${userId ?? ''}`.trim();
  if (!id) return name;
  return `[${name}](mfuns-user:${id})`;
}

/**
 * @param {string} value
 */
function replaceBracketMentionsInPlainText(value) {
  return value.replace(BRACKET_MENTION_RE, (_match, id, name) =>
    mentionMarkdownToken(`${id ?? ''}`.trim(), `${name ?? ''}`.trim()),
  );
}

/**
 * @param {string} value
 */
function isApiRichHtml(value) {
  const trimmed = `${value ?? ''}`.trim();
  if (!trimmed || !/<[a-z][\s>]/i.test(trimmed)) return false;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return false;
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.ops)) return false;
    } catch {
      /* HTML */
    }
  }
  return true;
}

/**
 * @param {Element} el
 */
function mentionUserIdFromElement(el) {
  const attrs = [
    'data-user-id',
    'data-id',
    'data-userid',
    'data-uid',
    'data-mention-id',
    'data-mention-user-id',
  ];
  for (const key of attrs) {
    const raw = `${el.getAttribute(key) ?? ''}`.trim();
    if (/^\d+$/.test(raw)) return raw;
  }
  const href = `${el.getAttribute('href') ?? ''}`.trim();
  const hrefMatch =
    href.match(/^mfuns-user:(\d+)$/i) ??
    href.match(/\/user\/(\d+)(?:\?|$|\/)/i) ??
    href.match(/[?&]user_id=(\d+)/i);
  return hrefMatch ? hrefMatch[1] : '';
}

/**
 * @param {Element} el
 */
function isMentionElement(el) {
  const tag = el.tagName.toLowerCase();
  if (tag !== 'a' && tag !== 'span') return false;
  if (mentionUserIdFromElement(el)) return true;
  const cls = `${el.getAttribute('class') ?? ''}`.toLowerCase();
  if (/mention|at-user|user-link|ql-mention/.test(cls)) return true;
  if (tag === 'a' && /\/user\/\d+/i.test(el.getAttribute('href') ?? '')) return true;
  return false;
}

/**
 * @param {Document} doc
 * @param {string} userId
 * @param {string} label
 */
function createMentionSpan(doc, userId, label) {
  const span = doc.createElement('span');
  span.className = 'markdown-body__mention';
  span.setAttribute('data-author-profile', userId);
  span.setAttribute('role', 'link');
  span.setAttribute('tabindex', '0');
  const text = label.trim() || '@用户';
  span.textContent = text.startsWith('@') ? text : `@${text}`;
  return span;
}

/**
 * @param {ParentNode} root
 */
function replaceBracketMentionsInDom(root) {
  const doc = root.ownerDocument ?? document;
  /** @type {Text[]} */
  const textNodes = [];
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    textNodes.push(/** @type {Text} */ (walker.currentNode));
  }
  for (const node of textNodes) {
    const text = node.textContent ?? '';
    if (!BRACKET_MENTION_RE.test(text)) {
      BRACKET_MENTION_RE.lastIndex = 0;
      continue;
    }
    BRACKET_MENTION_RE.lastIndex = 0;
    const frag = doc.createDocumentFragment();
    let last = 0;
    for (const match of text.matchAll(BRACKET_MENTION_RE)) {
      const start = match.index ?? 0;
      if (start > last) frag.appendChild(doc.createTextNode(text.slice(last, start)));
      const id = `${match[1] ?? ''}`.trim();
      const name = `${match[2] ?? ''}`.trim();
      if (id) frag.appendChild(createMentionSpan(doc, id, name));
      else frag.appendChild(doc.createTextNode(match[0]));
      last = start + match[0].length;
    }
    if (last < text.length) frag.appendChild(doc.createTextNode(text.slice(last)));
    node.parentNode?.replaceChild(frag, node);
  }
}

/**
 * 服务端 html:1 正文：保留结构，将 @ 提及替换为可点击的 mention 节点。
 * @param {string} html
 */
function upgradeMentionsInApiHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  replaceBracketMentionsInDom(doc.body);
  doc.body.querySelectorAll('a, span').forEach((el) => {
    if (!isMentionElement(el)) return;
    const id = mentionUserIdFromElement(el);
    if (!id) return;
    const label = (el.textContent ?? '').trim() || '@用户';
    el.replaceWith(createMentionSpan(doc, id, label));
  });
  return doc.body.innerHTML;
}

function formatQuillInline(text, attributes) {
  let result = text;
  if (attributes.code === true) result = `\`${result}\``;
  if (attributes.bold === true) result = `**${result}**`;
  if (attributes.italic === true) result = `*${result}*`;
  if (attributes.strike === true) result = `~~${result}~~`;
  const linkRaw = `${attributes.link ?? ''}`.trim();
  const userLink = linkRaw.match(/^mfuns-user:(\d+)$/i);
  if (userLink) {
    return mentionMarkdownToken(userLink[1], result.startsWith('@') ? result : `@${result}`);
  }
  const link = safeHttpUri(linkRaw);
  if (link) result = `[${result}](${link})`;
  return result;
}

/**
 * @param {unknown} ops
 */
export function quillOpsToMarkdown(ops) {
  /** @type {string[]} */
  const output = [];
  let line = '';

  /**
   * @param {Record<string, unknown>} attributes
   */
  const finishLine = (attributes) => {
    const content = line;
    line = '';
    if (attributes.header != null) {
      const level = Math.min(6, Math.max(1, Number.parseInt(`${attributes.header}`, 10) || 1));
      output.push(`${'#'.repeat(level)} ${content}`);
    } else if (attributes.list === 'ordered') {
      output.push(`1. ${content}`);
    } else if (attributes.list != null) {
      output.push(`- ${content}`);
    } else if (attributes.blockquote === true) {
      output.push(`> ${content}`);
    } else if (attributes['code-block'] === true) {
      output.push('```', content, '```');
    } else {
      output.push(content);
    }
  };

  if (!Array.isArray(ops)) return '';
  for (const op of ops) {
    if (!op || typeof op !== 'object') continue;
    const item = /** @type {Record<string, unknown>} */ (op);
    const attributes = asAttributes(item.attributes);
    const insert = item.insert;
    if (insert && typeof insert === 'object') {
      const map = /** @type {Record<string, unknown>} */ (insert);
      const sticker = map.sticker;
      if (typeof sticker === 'string' && sticker) {
        line += `![sticker:${sticker}](https://resource.mfuns.net/image/sticker/x.png)`;
        continue;
      }
      const mention = asAttributes(map.mention);
      const mentionName = `${mention.value ?? mention.name ?? ''}`.trim();
      const mentionId = `${mention.id ?? mention.user_id ?? mention.uid ?? mention.userId ?? ''}`.trim();
      if (mentionName) {
        line += mentionMarkdownToken(mentionId, mentionName);
        continue;
      }
      const image =
        resolveRichImageUrl(`${map.image ?? ''}`) ?? safeHttpUri(`${map.image ?? ''}`);
      if (image) {
        line += `![图片](${image})`;
        continue;
      }
      continue;
    }
    if (typeof insert !== 'string') continue;
    const pieces = insert.split('\n');
    for (let index = 0; index < pieces.length; index += 1) {
      if (pieces[index]) {
        line += formatQuillInline(pieces[index], attributes);
      }
      if (index < pieces.length - 1) finishLine(attributes);
    }
  }
  if (line) finishLine({});
  return output.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * @param {Element} element
 * @param {{ ordered?: boolean }} options
 */
function renderList(element, options = {}) {
  const ordered = options.ordered === true;
  let index = 1;
  /** @type {string[]} */
  const lines = [];
  element.querySelectorAll(':scope > li').forEach((child) => {
    const text = renderChildren(child).trim();
    if (!text) return;
    lines.push(ordered ? `${index}. ${text}` : `- ${text}`);
    index += 1;
  });
  return lines.length ? `${lines.join('\n')}\n\n` : '';
}

/**
 * @param {Node} node
 */
function renderNode(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = /** @type {Element} */ (node);
  const tag = el.tagName.toLowerCase();
  const text = renderChildren(el).trim();

  switch (tag) {
    case 'br':
      return '\n';
    case 'p':
    case 'div':
    case 'section':
      return text ? `${text}\n\n` : '\n';
    case 'h1':
      return `# ${text}\n\n`;
    case 'h2':
      return `## ${text}\n\n`;
    case 'h3':
      return `### ${text}\n\n`;
    case 'h4':
      return `#### ${text}\n\n`;
    case 'strong':
    case 'b':
      return text ? `**${text}**` : '';
    case 'em':
    case 'i':
      return text ? `*${text}*` : '';
    case 's':
    case 'strike':
    case 'del':
      return text ? `~~${text}~~` : '';
    case 'blockquote': {
      const quote = text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => `> ${line}`)
        .join('\n');
      return `${quote}\n\n`;
    }
    case 'pre':
      return text ? `\n\`\`\`\n${text}\n\`\`\`\n\n` : '';
    case 'code':
      return el.parentElement?.tagName.toLowerCase() === 'pre' || !text ? text : `\`${text}\``;
    case 'ul':
      return renderList(el, { ordered: false });
    case 'ol':
      return renderList(el, { ordered: true });
    case 'li':
      return text;
    case 'a': {
      const idFromEl = mentionUserIdFromElement(el);
      if (idFromEl && text) {
        return mentionMarkdownToken(idFromEl, text);
      }
      const href = el.getAttribute('href') ?? '';
      const userMatch =
        href.match(/^mfuns-user:(\d+)$/i) ??
        href.match(/\/user\/(\d+)(?:\?|$|\/)/i) ??
        href.match(/[?&]user_id=(\d+)/i);
      if (userMatch && text) {
        return mentionMarkdownToken(userMatch[1], text);
      }
      const link = safeHttpUri(href);
      return link && text ? `[${text}](${link})` : text;
    }
    case 'span': {
      if (isMentionElement(el)) {
        const id = mentionUserIdFromElement(el);
        const label = (el.textContent ?? '').trim() || '@用户';
        return mentionMarkdownToken(id, label);
      }
      return renderChildren(el);
    }
    case 'img': {
      const rawSrc = el.getAttribute('src') ?? '';
      const image = resolveRichImageUrl(rawSrc) ?? safeHttpUri(rawSrc);
      if (!image) return '';
      const className = (el.getAttribute('class') ?? '').toLowerCase();
      if (className.includes('sticker')) {
        const key =
          stickerKeyFromImg(el.getAttribute('alt'), rawSrc) ??
          stickerKeyFromImg(el.getAttribute('alt'), image) ??
          'sticker';
        return `![sticker:${key}](${image})\n\n`;
      }
      const alt = (el.getAttribute('alt') ?? '图片').trim() || '图片';
      return `![${alt}](${image})\n\n`;
    }
    default:
      return renderChildren(el);
  }
}

/**
 * @param {ParentNode} parent
 */
function renderChildren(parent) {
  let out = '';
  parent.childNodes.forEach((node) => {
    out += renderNode(node);
  });
  return out;
}

/**
 * @param {string} html
 */
function htmlToMarkdown(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return renderChildren(doc.body).replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * 与 Flutter `normalizeRichContent` 一致：Quill / HTML → Markdown。
 * @param {string} source
 */
export function normalizeRichContent(source) {
  const value = `${source ?? ''}`.trim();
  if (!value) return '';
  if (value.startsWith('{')) {
    try {
      const decoded = JSON.parse(value);
      const ops =
        decoded && typeof decoded === 'object'
          ? /** @type {Record<string, unknown>} */ (decoded).ops
          : null;
      if (Array.isArray(ops)) return quillOpsToMarkdown(ops);
    } catch {
      /* fall through */
    }
  }
  if (value.startsWith('[')) {
    try {
      const ops = JSON.parse(value);
      if (Array.isArray(ops)) return quillOpsToMarkdown(ops);
    } catch {
      /* fall through */
    }
  }
  if (!/<[A-Za-z][^>]*>/.test(value)) {
    return replaceBracketMentionsInPlainText(value);
  }
  return htmlToMarkdown(value);
}

marked.setOptions({
  gfm: true,
  breaks: true,
});

marked.use({
  renderer: {
    /**
     * @param {{ href?: string | null, title?: string | null, text?: string, tokens?: unknown[] }} token
     */
    link(token) {
      const href = `${token.href ?? ''}`;
      const renderer = /** @type {{ parser?: { parseInline: (tokens: unknown[]) => string } }} */ (
        this
      );
      const inner =
        token.tokens && renderer.parser
          ? renderer.parser.parseInline(token.tokens)
          : escapeHtmlText(`${token.text ?? ''}`);
      const userMatch = href.match(/^mfuns-user:(\d+)$/i);
      if (userMatch) {
        const id = userMatch[1];
        return `<span class="markdown-body__mention" data-author-profile="${id}" role="link" tabindex="0">${inner}</span>`;
      }
      const safeLink = safeHttpUri(href);
      if (!safeLink) return inner;
      const title = token.title
        ? ` title="${escapeHtmlText(`${token.title}`)}"`
        : '';
      return `<a href="${safeLink.replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer"${title}>${inner}</a>`;
    },
    /**
     * @param {{ href?: string | null, title?: string | null, text?: string }} token
     */
    image(token) {
      const altRaw = `${token.text ?? token.title ?? '图片'}`;
      if (altRaw.startsWith('sticker:')) {
        const key = altRaw.slice('sticker:'.length).replace(/"/g, '');
        return `<img alt="sticker:${key}" class="markdown-body__img markdown-body__sticker" data-sticker-key="${key}" width="42" height="42" />`;
      }
      const href = resolveRichImageUrl(token.href ?? '');
      if (!href) return '';
      const alt = altRaw.replace(/"/g, '&quot;');
      const title = token.title
        ? ` title="${`${token.title}`.replace(/"/g, '&quot;')}"`
        : '';
      return `<img src="${href.replace(/"/g, '&quot;')}" alt="${alt}"${title} loading="lazy" class="markdown-body__img" />`;
    },
  },
});

const PURIFY_CONFIG = {
  ADD_ATTR: [
    'target',
    'rel',
    'loading',
    'class',
    'data-sticker-key',
    'data-author-profile',
    'role',
    'tabindex',
    'width',
    'height',
  ],
  ADD_URI_SAFE_ATTR: ['src'],
};

/**
 * @param {string} source
 * @returns {string}
 */
export function renderRichMarkdownHtml(source) {
  const value = `${source ?? ''}`.trim();
  if (!value) return '';
  if (isApiRichHtml(value)) {
    return DOMPurify.sanitize(upgradeMentionsInApiHtml(value), PURIFY_CONFIG);
  }
  const markdown = normalizeRichContent(value);
  if (!markdown) return '';
  const rawHtml = marked.parse(markdown, { async: false });
  const safe =
    typeof rawHtml === 'string'
      ? DOMPurify.sanitize(rawHtml, PURIFY_CONFIG)
      : DOMPurify.sanitize(String(rawHtml), PURIFY_CONFIG);
  return safe;
}

/**
 * @param {ParentElement} root
 */
async function enhanceRichContentStickers(root) {
  const imgs = [...root.querySelectorAll('img')].filter((img) => {
    if (img.hasAttribute('data-sticker-key')) return true;
    const alt = img.getAttribute('alt') ?? '';
    return alt.startsWith('sticker:');
  });
  if (imgs.length === 0) return;
  await Promise.all(
    imgs.map(async (img) => {
      const key =
        img.getAttribute('data-sticker-key') ??
        (img.getAttribute('alt') ?? '').slice('sticker:'.length);
      if (!key) return;
      try {
        const src = await mediaSrcForStickerKey(key);
        if (src) img.setAttribute('src', src);
      } catch {
        /* 表情包列表加载失败时保留占位 */
      }
    }),
  );
}

export function enhanceRichContentMedia(root) {
  root.querySelectorAll('img').forEach((img) => {
    const alt = img.getAttribute('alt') ?? '';
    if (img.hasAttribute('data-sticker-key') || alt.startsWith('sticker:')) {
      img.classList.add('markdown-body__sticker');
      return;
    }
    const src = img.getAttribute('src') ?? '';
    if (src.startsWith('mfuns-media://')) {
      img.loading = 'lazy';
      img.classList.add('markdown-body__img');
      return;
    }
    const proxied = mediaSrcForRichImage(src);
    if (proxied) img.setAttribute('src', proxied);
    img.loading = 'lazy';
    img.classList.add('markdown-body__img');
  });
  root.querySelectorAll('a[href^="http"]').forEach((link) => {
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
  });
}

/**
 * @param {HTMLElement} element
 * @param {string} source
 */
export function mountRichContent(element, source) {
  element.innerHTML = renderRichMarkdownHtml(source);
  enhanceRichContentMedia(element);
  void enhanceRichContentStickers(element);
}
