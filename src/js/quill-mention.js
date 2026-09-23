/** @typedef {{ id: string | number, value: string }} MentionValue */

let registered = false;

/**
 * @param {import('../vendor/quill.mjs').default} Quill
 */
export function registerQuillMention(Quill) {
  if (registered) return;
  const Embed = Quill.import('blots/embed');
  class MentionBlot extends Embed {
    static create(value) {
      const node = super.create();
      const data = value && typeof value === 'object' ? value : {};
      const id = `${data.id ?? ''}`;
      const name = `${data.value ?? ''}`.trim();
      node.setAttribute('data-id', id);
      node.setAttribute('data-value', name);
      node.classList.add('ql-mention');
      node.textContent = name ? (name.startsWith('@') ? name : `@${name}`) : '@用户';
      return node;
    }

    static value(node) {
      return {
        id: node.getAttribute('data-id') ?? '',
        value: node.getAttribute('data-value') ?? '',
      };
    }
  }
  MentionBlot.blotName = 'mention';
  MentionBlot.tagName = 'span';
  MentionBlot.className = 'ql-mention';
  Quill.register(MentionBlot);
  registered = true;
}
