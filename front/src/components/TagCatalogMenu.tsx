import { ChangeEvent, useRef, useState } from 'react';
import { api, TagCatalogItem } from '../api/client';
import { invalidateCatalog } from '../lib/useCatalog';
import { useMenuKeys } from '../lib/useMenuKeys';
import { useOutsideClick } from '../lib/useOutsideClick';
import ConfirmDialog from './ConfirmDialog';

type Props = {
  // 取り込み・復元の完了通知（件数メッセージ。呼び出し側で一覧を再取得して表示する）
  onDone: (message: string) => void;
  onError: (message: string) => void;
};

// 実行前の確認ダイアログ（インポート・デフォルト復元で共用）。runは完了メッセージを返す
type Pending = { title: string; message: string; actionLabel: string; run: () => Promise<string> };

// タグ一覧のエクスポート/インポート/デフォルト復元のメニュー（ExportImport.tsxと同パターン）。
// エクスポートはタグカタログ全件をダウンロードし、インポート・復元は ConfirmDialog で確認を挟んで実行する。
// キーボード: ↑↓で移動、Enter/Spaceで実行、Escで閉じる
function TagCatalogMenu({ onDone, onError }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  useOutsideClick(rootRef, open ? () => setOpen(false) : undefined);

  // 確認後の実行本体（インポート・復元共通）。カタログの共有キャッシュを無効化し、件数を親へ通知する
  const runPending = async () => {
    if (!pending) return;
    const p = pending;
    setPending(null);
    setBusy(true);
    try {
      const message = await p.run();
      invalidateCatalog();
      onDone(message);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  // JSONファイルを読み取り、取り込み内容を確認ダイアログで見せる（取り込みは確認後）
  const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setOpen(false);
    let tags: TagCatalogItem[];
    try {
      const parsed: unknown = JSON.parse(await file.text());
      // エクスポートの形式（{tags: [...]}）とタグ配列のみのどちらも受け付ける
      const list = Array.isArray(parsed) ? parsed : (parsed as { tags?: unknown }).tags;
      if (!Array.isArray(list) || list.length === 0) {
        throw new Error('エクスポートしたタグのJSONファイルを選択してください');
      }
      tags = list as TagCatalogItem[];
    } catch (err) {
      if (err instanceof SyntaxError) onError('JSONファイルを読み取れませんでした');
      else onError(err instanceof Error ? err.message : String(err));
      return;
    }
    setPending({
      title: 'タグのインポート',
      message: `${tags.length}件のタグを取り込みます。\n同名の既存タグはスキップされます。\n取り込みますか？`,
      actionLabel: '取り込む',
      run: async () => {
        const res = await api.importTags(tags);
        return `${res.imported}件のタグを登録しました（${res.skipped}件スキップ）`;
      },
    });
  };

  const confirmRestore = () => {
    setOpen(false);
    setPending({
      title: 'デフォルトタグの復元',
      message:
        '不足しているデフォルトのタグを追加します。\n既存のタグ（名前・色・並び順）は変更されません。\n復元しますか？',
      actionLabel: '復元する',
      run: async () => {
        const res = await api.restoreDefaultTags();
        return `${res.restored}件のデフォルトタグを復元しました`;
      },
    });
  };

  // hrefありはダウンロードリンク、なしはボタン（onClickでkeyごとに実行）
  const items = [
    { key: 'export', label: 'エクスポート', href: api.tagsExportUrl() as string | null },
    { key: 'import', label: 'インポート...', href: null },
    { key: 'restore', label: 'デフォルトタグの復元', href: null },
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
    <span ref={rootRef} className="relative inline-block" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        className="border rounded-sm px-2 py-0.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
        disabled={busy}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {busy ? '処理中...' : 'エクスポート/インポート ▾'}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="タグのエクスポート/インポート"
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
                onClick={() => (item.key === 'import' ? fileRef.current?.click() : confirmRestore())}
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

      {pending && (
        <ConfirmDialog
          title={pending.title}
          message={pending.message}
          actionLabel={pending.actionLabel}
          onConfirm={runPending}
          onClose={() => setPending(null)}
        />
      )}
    </span>
  );
}

export default TagCatalogMenu;
