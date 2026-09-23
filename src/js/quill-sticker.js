let registered = false;

/**
 * @param {import('../vendor/quill.mjs').default} Quill
 */
export function registerQuillSticker(Quill) {
  if (registered) return;
  const Embed = Quill.import('blots/embed');
  class StickerBlot extends Embed {
    static create(value) {
      const node = super.create();
      const data = value && typeof value === 'object' ? value : { key: value };
      const key = `${data.key ?? data.sticker ?? value ?? ''}`.trim();
      const src = `${data.src ?? data.url ?? ''}`.trim();
      node.setAttribute('data-sticker-key', key);
      node.classList.add('ql-sticker');
      node.setAttribute('alt', key ? `[${key}]` : '表情');
      node.setAttribute('draggable', 'false');
      if (src) {
        node.setAttribute('src', src);
      } else if (key) {
        void import('./emoji-pack.js').then(({ mediaSrcForStickerKey }) =>
          mediaSrcForStickerKey(key).then((url) => {
            if (url) node.setAttribute('src', url);
          }),
        );
      }
      return node;
    }

    static value(node) {
      return node.getAttribute('data-sticker-key') ?? '';
    }
  }
  StickerBlot.blotName = 'sticker';
  StickerBlot.tagName = 'IMG';
  StickerBlot.className = 'ql-sticker';
  Quill.register(StickerBlot);
  registered = true;
}
