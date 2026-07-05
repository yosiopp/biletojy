import { KeyboardEvent as ReactKeyboardEvent, useRef, useState } from 'react';
import { splitTags } from '../lib/tags';
import { useOutsideClick } from '../lib/useOutsideClick';
import { deleteView, loadViews, matchesView, SavedView, saveView } from '../lib/views';

type Props = {
  q: string;
  tags: string[];
  onApply: (q: string, tags: string[]) => void;
};

// 保存済み検索（ビュー）のチップ。クリックでビュー一覧のプルダウンが開く
// 現在の検索条件（q + tags）に名前を付けて保存し、選択で一覧の条件を差し替える
// キーボード: ↑↓で移動、Enter/Spaceで適用、Delete/Backspaceで削除、Escで閉じる
function ViewSelect({ q, tags, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState<SavedView[]>(loadViews);
  const [active, setActive] = useState(-1);
  const [name, setName] = useState('');
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const hasFilter = q.length > 0 || tags.length > 0;
  const current = views.find((v) => matchesView(v, q, tags));

  useOutsideClick(rootRef, open ? () => setOpen(false) : undefined);

  const toggle = () => {
    if (open) {
      setActive(-1);
      setOpen(false);
      return;
    }
    // 別タブでの保存も拾えるように開くたびに読み直す
    const list = loadViews();
    setViews(list);
    setActive(Math.max(list.findIndex((v) => matchesView(v, q, tags)), list.length > 0 ? 0 : -1));
    setName('');
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setActive(-1);
    buttonRef.current?.focus();
  };

  const apply = (view: SavedView) => {
    onApply(view.q, [...view.tags]);
    setOpen(false);
    setActive(-1);
  };

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed || !hasFilter) return;
    setViews(saveView({ name: trimmed, q, tags }));
    setName('');
    close();
  };

  const remove = (viewName: string) => {
    const next = deleteView(viewName);
    setViews(next);
    setActive((i) => Math.min(i, next.length - 1));
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') {
      if (open) {
        e.stopPropagation();
        close();
      }
      return;
    }
    // ビュー名入力欄などにフォーカスがあるときはリスト操作しない
    if (e.target !== buttonRef.current) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        toggle();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, views.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (active >= 0 && active < views.length) apply(views[active]);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (active >= 0 && active < views.length) remove(views[active].name);
    }
  };

  return (
    <span ref={rootRef} className="relative inline-block mr-1 mb-1" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex items-center rounded-lg border py-0.5 px-2 whitespace-nowrap ${
          current
            ? 'bg-neutral-100 border-transparent'
            : 'bg-white border-dashed border-neutral-300 text-neutral-500 hover:bg-neutral-50'
        }`}
        onClick={toggle}
      >
        <span className="border-r border-neutral-300 pr-1 text-sm opacity-70">ビュー</span>
        <span className={`pl-2 ${current ? '' : 'text-neutral-400'}`}>{current?.name ?? '-'}</span>
        <span className="ml-1 text-xs text-neutral-400">▾</span>
      </button>

      {open && (
        <div className="absolute z-10 left-0 top-full mt-1 bg-white border rounded-sm shadow-md min-w-full max-h-64 overflow-auto whitespace-nowrap">
          {views.length === 0 ? (
            <p className="px-2 py-1 text-sm text-neutral-400">保存済みのビューはありません</p>
          ) : (
            <div role="listbox" aria-label="ビュー">
              {views.map((view, i) => (
                <div
                  key={view.name}
                  className={`flex items-center ${
                    i === active ? 'bg-blue-100' : view === current ? 'bg-blue-50' : ''
                  } hover:bg-neutral-100`}
                  onMouseEnter={() => setActive(i)}
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={view === current}
                    className="flex-1 text-left px-2 py-1 text-sm"
                    onClick={() => apply(view)}
                  >
                    <span className="inline-block w-4 text-blue-700">{view === current ? '✓' : ''}</span>
                    {view.name}
                    <span className="text-neutral-400 ml-1 text-xs">
                      {[...view.tags, ...splitTags(view.q)].join(' ')}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1 text-neutral-400 hover:text-neutral-700"
                    title={`ビュー「${view.name}」を削除`}
                    onClick={() => remove(view.name)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="border-t p-2">
            {hasFilter ? (
              <div className="flex gap-1">
                <input
                  type="text"
                  className="border rounded-sm px-1 py-0.5 text-sm w-40"
                  placeholder="現在の条件に名前を付ける"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      save();
                    }
                  }}
                />
                <button
                  type="button"
                  className="bg-blue-600 text-white rounded-sm px-2 py-0.5 text-sm hover:bg-blue-700 disabled:opacity-50"
                  disabled={!name.trim()}
                  onClick={save}
                >
                  保存
                </button>
              </div>
            ) : (
              <p className="text-sm text-neutral-400">検索条件を設定すると保存できます</p>
            )}
          </div>
        </div>
      )}
    </span>
  );
}

export default ViewSelect;
