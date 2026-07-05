import { useEffect, useId, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';
import remarkGfm from 'remark-gfm';

// remark ASTの必要最小限の型（依存を増やさないため自前定義）
type MdNode = {
  type: string;
  value?: string;
  children?: MdNode[];
  url?: string;
};

// 本文中の #123 形式をチケット詳細へのリンクに変換するremarkプラグイン。
// テキストノードだけが対象なので、コードブロックやインラインコードには作用しない
function remarkTicketLinks() {
  return (tree: MdNode) => linkifyTicketRefs(tree);
}

function linkifyTicketRefs(node: MdNode) {
  // 既存リンクの中はネストさせない
  if (!node.children || node.type === 'link' || node.type === 'linkReference') return;
  node.children = node.children.flatMap((child) => {
    if (child.type === 'text' && child.value) {
      return splitTicketRefs(child.value);
    }
    linkifyTicketRefs(child);
    return [child];
  });
}

function splitTicketRefs(value: string): MdNode[] {
  const nodes: MdNode[] = [];
  let last = 0;
  for (const m of value.matchAll(/#(\d+)/g)) {
    if (m.index > last) nodes.push({ type: 'text', value: value.slice(last, m.index) });
    nodes.push({ type: 'link', url: `/tickets/${m[1]}`, children: [{ type: 'text', value: m[0] }] });
    last = m.index + m[0].length;
  }
  if (last < value.length) nodes.push({ type: 'text', value: value.slice(last) });
  return nodes;
}

// mermaidは重いのでmermaidブロックを初めて描画する時にだけ読み込む
let mermaidLoader: Promise<typeof import('mermaid')['default']> | null = null;
function loadMermaid() {
  if (!mermaidLoader) {
    mermaidLoader = import('mermaid').then((m) => {
      m.default.initialize({ startOnLoad: false, securityLevel: 'strict' });
      return m.default;
    });
  }
  return mermaidLoader;
}

function Mermaid({ code }: { code: string }) {
  const id = useId().replace(/:/g, '_');
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    loadMermaid()
      .then((mermaid) => mermaid.render(`mermaid${id}`, code))
      .then(({ svg }) => {
        if (!cancelled) {
          setSvg(svg);
          setError('');
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [code, id]);

  if (error) {
    return <pre className="bg-red-50 text-red-700 p-2 rounded-sm text-sm">{error}</pre>;
  }
  return <div dangerouslySetInnerHTML={{ __html: svg }} />;
}

type Props = {
  content: string;
};

function Markdown({ content }: Props) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkTicketLinks]}
        components={{
          // アプリ内リンク（#123 のチケット参照）はSPA遷移にする
          a({ href, children }) {
            if (href?.startsWith('/')) {
              return <Link to={href}>{children}</Link>;
            }
            return <a href={href}>{children}</a>;
          },
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className ?? '');
            if (match?.[1] === 'mermaid') {
              return <Mermaid code={String(children)} />;
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default Markdown;
