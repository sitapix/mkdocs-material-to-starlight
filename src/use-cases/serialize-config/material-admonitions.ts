/**
 * Serialize the local remark plugin used by generated projects to preserve
 * Material admonition variants that Starlight's four built-in asides do not
 * cover. Keeping this implementation in the generated project avoids the
 * deprecated Astro configuration used by starlight-markdown-blocks 0.1.1.
 */

export function serializeMaterialAdmonitionsPlugin(): string {
  return `import { visit } from 'unist-util-visit';

const variants = {
  abstract: { label: 'Abstract', color: 'blue', icon: '📋' },
  info: { label: 'Info', color: 'blue', icon: 'ℹ️' },
  question: { label: 'Question', color: 'green', icon: '❓' },
  success: { label: 'Success', color: 'green', icon: '✅' },
  failure: { label: 'Failure', color: 'red', icon: '❌' },
  bug: { label: 'Bug', color: 'red', icon: '🐛' },
  example: { label: 'Example', color: 'purple', icon: '🧪' },
};

function element(tagName, properties = {}, children = []) {
  return {
    type: 'paragraph',
    data: { hName: tagName, hProperties: properties },
    children,
  };
}

function textContent(nodes) {
  return nodes
    .map((node) => {
      if (typeof node.value === 'string') return node.value;
      return Array.isArray(node.children) ? textContent(node.children) : '';
    })
    .join('')
    .trim();
}

export default function remarkMaterialAdmonitions() {
  return (tree) => {
    visit(tree, 'containerDirective', (node, index, parent) => {
      if (!parent || index === undefined) return;
      const variant = variants[node.name];
      if (!variant) return;

      let label = [{ type: 'text', value: variant.label }];
      const firstChild = node.children[0];
      if (firstChild?.type === 'paragraph' && firstChild.data?.directiveLabel === true) {
        label = firstChild.children;
        node.children.splice(0, 1);
      }
      const labelText = textContent(label) || variant.label;

      parent.children.splice(
        index,
        1,
        element(
          'aside',
          {
            'aria-label': labelText,
            class: [
              'starlight-aside',
              'starlight-custom-aside',
              \`starlight-custom-aside--color-\${variant.color}\`,
              \`starlight-custom-aside--\${node.name}\`,
            ].join(' '),
          },
          [
            element(
              'p',
              { class: 'starlight-aside__title', 'aria-hidden': 'true' },
              [
                {
                  type: 'html',
                  value: \`<span class="starlight-aside__icon">\${variant.icon}</span>\`,
                },
                element('span', {}, label),
              ],
            ),
            element('div', { class: 'starlight-aside__content' }, node.children),
          ],
        ),
      );
    });
  };
}
`;
}
