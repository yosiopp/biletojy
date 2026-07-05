import { ChangeEvent, KeyboardEvent as ReactKeyboardEvent, useRef, useState } from 'react';
import { api, TicketExport } from '../api/client';
import { useOutsideClick } from '../lib/useOutsideClick';

type Props = {
  q: string;
  tags: string[];
  onImported: (count: number) => void;
  onError: (message: string) => void;
};

// チケット一覧のエクスポート/インポートのメニュー。
// エクスポートは現在の検索条件（q + tags）で絞り込んだチケットをコメント込みでダウンロードし、
// インポートはJSONエクスポートファイルを選択して新規チケットとして取り込む
// キーボード: ↑↓で移動、Enter/Spaceで実行、Escで閉じる
function ExportImport({ q, tags, onImported, onError }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [importing, setImporting] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  useOutsideClick(rootRef, open ? () => setOpen(false) : undefined);

  const close = () => {
    setOpen(false);
    setActive(0);
    buttonRef.current?.focus();
  };

  // JSONエクスポートファイルを読み取ってインポートし、結果を親へ通知する
  const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setOpen(false);
    setImporting(true);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      // エクスポートの形式（{tickets: [...]}）とチケット配列のみのどちらも受け付ける
      const tickets = Array.isArray(parsed) ? parsed : (parsed as { tickets?: unknown }).tickets;
      if (!Array.isArray(tickets) || tickets.length === 0) {
        throw new Error('エクスポートしたJSONファイルを選択してください');
      }
      const res = await api.importTickets(tickets as TicketExport[]);
      onImported(res.imported);
    } catch (err) {
      if (err instanceof SyntaxError) {
        onError('JSONファイルを読み取れませんでした');
      } else {
        onError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setImporting(false);
    }
  };

  const items = [
    { key: 'export-json', label: 'JSONエクスポート', href: api.exportUrl(q, tags, 'json') },
    { key: 'export-md', label: 'Markdownエクスポート', href: api.exportUrl(q, tags, 'markdown') },
    { key: 'import', label: 'JSONインポート...', href: null },
  ];
  const hasFilter = q.length > 0 || tags.length > 0;

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') {
      if (open) {
        e.stopPropagation();
        close();
      }
      return;
    }
    if (e.target !== buttonRef.current) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      itemRefs.current[active]?.click();
    }
  };

  const itemClass = (i: number) =>
    `block w-full text-left px-2 py-1 text-sm ${i === active ? 'bg-blue-100' : ''} hover:bg-neutral-100`;

  return (
    <span ref={rootRef} className="relative inline-block" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        className="border rounded-sm px-2 py-0.5 hover:bg-neutral-100 disabled:opacity-50"
        disabled={importing}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {importing ? 'インポート中...' : 'エクスポート/インポート ▾'}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="エクスポート/インポート"
          className="absolute z-10 right-0 top-full mt-1 bg-white border rounded-sm shadow-md whitespace-nowrap"
        >
          {items.map((item, i) =>
            item.href ? (
              <a
                key={item.key}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                role="menuitem"
                className={itemClass(i)}
                href={item.href}
                download
                onMouseEnter={() => setActive(i)}
                onClick={() => setOpen(false)}
              >
                {item.label}
                {hasFilter && <span className="text-neutral-400 ml-1 text-xs">現在の検索条件</span>}
              </a>
            ) : (
              <button
                key={item.key}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="menuitem"
                className={`${itemClass(i)} border-t`}
                onMouseEnter={() => setActive(i)}
                onClick={() => fileRef.current?.click()}
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={onFileChange}
      />
    </span>
  );
}

export default ExportImport;
