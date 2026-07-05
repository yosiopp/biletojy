import { DiffLine } from '../lib/diff';

const STYLES = {
  same: { mark: ' ', className: '' },
  del: { mark: '-', className: 'bg-red-50 text-red-700' },
  add: { mark: '+', className: 'bg-blue-50 text-blue-700' },
} as const;

// 行単位の差分表示。削除行は赤、追加行は青で示す
function DiffView({ lines }: { lines: DiffLine[] }) {
  return (
    <div className="border rounded-sm font-mono text-sm py-1">
      {lines.map((line, i) => {
        const style = STYLES[line.kind];
        return (
          <div key={i} className={`px-2 whitespace-pre-wrap break-all ${style.className}`}>
            <span className="inline-block w-4 select-none opacity-60 whitespace-pre">{style.mark}</span>
            {line.text}
          </div>
        );
      })}
    </div>
  );
}

export default DiffView;
