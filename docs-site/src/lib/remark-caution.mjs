import { visit } from 'unist-util-visit';
import { toString } from 'mdast-util-to-string';

/** Turn Starlight-style :::caution ... ::: fences into a styled <aside>. */
export function remarkCaution() {
  return (tree) => {
    visit(tree, (node) => {
      if (!Array.isArray(node.children) || node.children.length === 0) return;
      if (node.type === 'caution') return;

      const next = [];
      const children = node.children;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const compact = compactCaution(child);
        if (compact) {
          next.push(compact);
          continue;
        }
        if (isFence(child, ':::caution')) {
          const inner = [];
          let j = i + 1;
          let closed = false;
          for (; j < children.length; j++) {
            if (isFence(children[j], ':::')) {
              closed = true;
              break;
            }
            inner.push(children[j]);
          }
          if (closed) {
            next.push(cautionNode(inner));
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

function isFence(node, value) {
  return node?.type === 'paragraph' && toString(node).trim() === value;
}

/** One paragraph that contains the whole :::caution ... ::: fence. */
function compactCaution(node) {
  if (node?.type !== 'paragraph') return null;
  const text = toString(node).replace(/\r\n/g, '\n').trim();
  const match = /^:::caution[ \t]*\n([\s\S]*?)\n[ \t]*:::$/.exec(text);
  if (!match) return null;
  const body = match[1].trim();
  if (!body) return null;
  return cautionNode([{
    type: 'paragraph',
    children: [{ type: 'text', value: body }],
  }]);
}

function cautionNode(inner) {
  return {
    type: 'caution',
    data: {
      hName: 'aside',
      hProperties: {
        className: ['docs-caution'],
        role: 'note',
      },
    },
    children: [
      {
        type: 'paragraph',
        data: {
          hProperties: { className: ['docs-caution-title'] },
        },
        children: [{ type: 'text', value: 'Caution' }],
      },
      ...inner,
    ],
  };
}
