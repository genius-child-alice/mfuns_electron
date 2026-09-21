/** @typedef {{ text?: string, stickerKey?: string, mentionId?: string, mentionName?: string }} CommentSpan */

const SPAN_PATTERN = /\[@(\d*):?([^\]]+)\]|\[([A-Za-z]+-\d+)\]/g;

/**
 * @param {string} raw
 * @returns {CommentSpan[]}
 */
export function commentSpansFromText(raw) {
  const text = `${raw ?? ''}`.trim();
  if (!text) return [];

  /** @type {CommentSpan[]} */
  const spans = [];
  let cursor = 0;
  for (const match of text.matchAll(SPAN_PATTERN)) {
    const start = match.index ?? 0;
    const before = text.slice(cursor, start);
    cursor = start + match[0].length;
    if (before) spans.push({ text: before });

    const mentionId = match[1];
    if (mentionId != null) {
      spans.push({ mentionId, mentionName: match[2] ?? '' });
      continue;
    }
    const stickerKey = match[3];
    if (stickerKey) spans.push({ stickerKey });
  }
  const tail = text.slice(cursor);
  if (tail) spans.push({ text: tail });
  return spans;
}

/**
 * @param {CommentSpan[]} spans
 * @param {string[]} images
 */
export function messageQuillJson(spans, images = []) {
  /** @type {Record<string, unknown>[]} */
  const ops = [];

  for (const span of spans) {
    if (span.mentionName) {
      ops.push({
        insert: {
          mention: { id: `${span.mentionId ?? ''}`, value: span.mentionName },
        },
      });
      continue;
    }
    if (span.stickerKey) {
      ops.push({ insert: { sticker: span.stickerKey } });
      continue;
    }
    const lines = `${span.text ?? ''}`.split('\n');
    for (const line of lines) {
      ops.push({ insert: `${line}\n` });
    }
  }

  for (const image of images) {
    if (image) ops.push({ insert: { image } });
  }

  if (ops.length === 0 || typeof ops[ops.length - 1].insert !== 'string') {
    ops.push({ insert: '\n' });
  }

  return JSON.stringify({ ops });
}

/**
 * @param {string} raw
 */
export function quillToText(raw) {
  const value = `${raw ?? ''}`.trim();
  if (!value) return '';
  if (!value.startsWith('{')) return value;

  try {
    const decoded = JSON.parse(value);
    const ops = decoded?.ops;
    if (!Array.isArray(ops)) return value;

    const parts = ops.map((item) => {
      if (!item || typeof item !== 'object') return '';
      const insert = /** @type {Record<string, unknown>} */ (item).insert;
      if (typeof insert === 'string') return insert;
      if (insert && typeof insert === 'object') {
        if (typeof insert.sticker === 'string') return '[表情]';
        const mention = insert.mention;
        if (mention && typeof mention === 'object') {
          return `@${mention.value ?? ''}`;
        }
      }
      return '';
    });
    return parts.join('').trim();
  } catch {
    return value;
  }
}
