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
function formatQuillInline(text, attributes) {
  let result = text;
  if (attributes.code === true) result = `\`${result}\``;
  if (attributes.bold === true) result = `**${result}**`;
  if (attributes.italic === true) result = `*${result}*`;
  if (attributes.strike === true) result = `~~${result}~~`;
  const link = safeHttpUri(`${attributes.link ?? ''}`);
  if (link) result = `[${result}](${link})`;
  return result;
}

/**
 * @param {unknown} ops
 */
function quillToMarkdown(ops) {
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
      }
      const image =
        resolveRichImageUrl(`${map.image ?? ''}`) ?? safeHttpUri(`${map.image ?? ''}`);
      if (image) line += `![图片](${image})`;
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
      const link = safeHttpUri(el.getAttribute('href'));
      return link && text ? `[${text}](${link})` : text;
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
      if (Array.isArray(ops)) return quillToMarkdown(ops);
    } catch {
      /* fall through */
    }
  }
  if (value.startsWith('[')) {
    try {
      const ops = JSON.parse(value);
      if (Array.isArray(ops)) return quillToMarkdown(ops);
    } catch {
      /* fall through */
    }
  }
  if (!/<[A-Za-z][^>]*>/.test(value)) return value;
  return htmlToMarkdown(value);
}

marked.setOptions({
  gfm: true,
  breaks: true,
});

marked.use({
  renderer: {
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
  ADD_ATTR: ['target', 'rel', 'loading', 'class', 'data-sticker-key', 'width', 'height'],
  ADD_URI_SAFE_ATTR: ['src'],
};

/**
 * @param {string} source
 * @returns {string}
 */
export function renderRichMarkdownHtml(source) {
  const markdown = normalizeRichContent(source);
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
