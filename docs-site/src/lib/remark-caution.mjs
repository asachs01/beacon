import { visit } from 'unist-util-visit';
import { toString } from 'mdast-util-to-string';

/**
 * Turn Starlight-style callout fences into styled <aside> elements:
 *
 *   :::caution            :::note[Custom title]
 *   Body text.            Body with `code` and [links](/docs/).
 *   :::                   :::
 *
 * Supported kinds: caution, note. Inner markdown (inline code, links,
 * emphasis, lists) is kept as-is.
 */
const KINDS = { caution: 'Caution', note: 'Note' };
const OPEN = /^:::(caution|note)(?:\[([^\]\n]*)\])?[ \t]*$/;

export function remarkCaution() {
  return (tree) => {
    visit(tree, (node) => {
      if (!Array.isArray(node.children) || node.children.length === 0) return;
      if (node.type === 'callout') return;

      const next = [];
      const children = node.children;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const compact = compactCallout(child);
        if (compact) {
          next.push(compact);
          continue;
        }
        const open = openFence(child);
        if (open) {
          const inner = [];
          let j = i + 1;
          let closed = false;
          for (; j < children.length; j++) {
            if (isClose(children[j])) {
              closed = true;
              break;
            }
            inner.push(children[j]);
          }
          if (closed) {
            next.push(calloutNode(open.kind, open.title, inner));
            i = j;
            continue;
          }
        }
        next.push(child);
      }
      node.children = next;
    });
  };
}

function openFence(node) {
  if (node?.type !== 'paragraph') return null;
  const m = OPEN.exec(toString(node).trim());
  return m ? { kind: m[1], title: m[2] } : null;
}

function isClose(node) {
  return node?.type === 'paragraph' && toString(node).trim() === ':::';
}

/**
 * One paragraph holding the whole fence (no blank lines inside). The first
 * text child starts with ":::kind[title]\n" and the last ends with "\n:::".
 * Trim those markers off and keep every other inline node untouched.
 */
function compactCallout(node) {
  if (node?.type !== 'paragraph' || node.children.length === 0) return null;
  const first = node.children[0];
  const last = node.children[node.children.length - 1];
  if (first.type !== 'text' || last.type !== 'text') return null;

  const head = /^:::(caution|note)(?:\[([^\]\n]*)\])?[ \t]*\r?\n/.exec(first.value);
  if (!head) return null;
  const tail = /\r?\n[ \t]*:::[ \t]*$/;
  const lastValue = first === last ? first.value.slice(head[0].length) : last.value;
  if (!tail.test(lastValue)) return null;

  const kids = node.children.map((c) => ({ ...c }));
  kids[0].value = kids[0].value.slice(head[0].length);
  const end = kids.length - 1;
  kids[end].value = kids[end].value.replace(tail, '');
  const body = kids.filter((c) => !(c.type === 'text' && c.value === ''));
  if (body.length === 0) return null;

  return calloutNode(head[1], head[2], [{ type: 'paragraph', children: body }]);
}

function calloutNode(kind, title, inner) {
  return {
    type: 'callout',
    data: {
      hName: 'aside',
      hProperties: {
        className: [`docs-${kind}`],
        role: 'note',
      },
    },
    children: [
      {
        type: 'paragraph',
        data: {
          hProperties: { className: [`docs-${kind}-title`] },
        },
        children: [{ type: 'text', value: (title && title.trim()) || KINDS[kind] }],
      },
      ...inner,
    ],
  };
}
