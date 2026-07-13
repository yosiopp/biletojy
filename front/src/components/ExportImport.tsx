import { ChangeEvent, useRef, useState } from 'react';
import { api, TicketExport } from '../api/client';
import { invalidateCatalog } from '../lib/useCatalog';
import { useMenuKeys } from '../lib/useMenuKeys';
import { useOutsideClick } from '../lib/useOutsideClick';
import Icon from './Icon';

type Props = {
  q: string;
  tags: string[];
  onImported: (count: number) => void;
  onError: (message: string) => void;
  // ルート要素へ付与する追加クラス（並び替えグループと視覚的に分けるための余白など）
  className?: string;
};

// チケット一覧のエクスポート/インポートのメニュー。
// エクスポートは現在の検索条件（q + tags）で絞り込んだチケットをコメント込みでダウンロードし、
// インポートはJSONエクスポートファイルを選択して新規チケットとして取り込む
// キーボード: ↑↓で移動、Enter/Spaceで実行、Escで閉じる
function ExportImport({ q, tags, onImported, onError, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [importing, setImporting] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  useOutsideClick(rootRef, open ? () => setOpen(false) : undefined);

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
      // 未定義タグはサーバー側でカタログへ自動登録されるため、共有キャッシュを取得し直させる
      invalidateCatalog();
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

  const { onKeyDown, close } = useMenuKeys({
    open,
    buttonRef,
    count: items.length,
    setActive,
    onOpen: () => setOpen(true),
    onClose: () => {
      setOpen(false);
      setActive(0);
    },
    onActivate: () => itemRefs.current[active]?.click(),
  });

  const itemClass = (i: number) =>
    `block w-full text-left px-2 py-1 text-sm ${i === active ? 'bg-blue-100 dark:bg-blue-900' : ''} hover:bg-neutral-100 dark:hover:bg-neutral-700`;

  return (
    <span ref={rootRef} className={`relative inline-block ${className}`} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="エクスポート/インポート"
        title={importing ? 'インポート中...' : 'エクスポート/インポート'}
        className="inline-flex items-center justify-center border rounded-full p-0.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
        disabled={importing}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Icon name="more_vert" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="エクスポート/インポート"
          className="absolute z-10 right-0 top-full mt-1 bg-white dark:bg-neutral-800 border rounded-sm shadow-md whitespace-nowrap"
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
