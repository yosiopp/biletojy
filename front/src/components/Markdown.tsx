import { useEffect, useId, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
        if (!cancelled) setSvg(svg);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [code, id]);

  if (error) {
    return <pre className="bg-red-50 text-red-700 p-2 rounded text-sm">{error}</pre>;
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
        remarkPlugins={[remarkGfm]}
        components={{
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
