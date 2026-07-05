import { KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from 'react';
import { parseTag } from '../lib/tags';

export type TagGroupOption = {
  value: string; // 選択時に onChange へ渡す値（"status:OPEN" 形式）
  label: string;
  note?: string | null;
};

type Props = {
  group: string; // "status" や "due-date@"
  options: TagGroupOption[];
  value: string; // 選択中のタグ（"status:OPEN" 形式）。未選択は ''
  color?: string | null;
  onChange: (tag: string) => void; // '' でクリア
};

// タググループのチップ。チップ自体をクリックすると選択肢のプルダウンが開く
// 末尾@のグループは選択肢の代わりに日付ピッカーを表示する
// キーボード: ↑↓で選択肢を移動、Enterで確定、Escで閉じる
function TagGroupSelect({ group, options, value, color, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [dateValue, setDateValue] = useState('');
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isDate = group.endsWith('@');
  const selectedName = value ? parseTag(value).name : '';

  // 先頭にクリア用の選択肢を加えたリスト（キーボード移動の対象）
  const items: TagGroupOption[] = [{ value: '', label: '-' }, ...options];

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  const toggle = () => {
    // 既存タグに時刻付きの値（例: 2026-07-04T10:00）が残っていても日付部分だけをピッカーに渡す
    if (isDate) setDateValue(selectedName.slice(0, 10));
    setActive(open ? -1 : Math.max(items.findIndex((item) => item.value === value), 0));
    setOpen(!open);
  };

  const select = (tag: string) => {
    onChange(tag);
    setOpen(false);
    setActive(-1);
  };

  const close = () => {
    setOpen(false);
    setActive(-1);
    buttonRef.current?.focus();
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        toggle();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    } else if (isDate) {
      if (e.key === 'Enter' && dateValue) {
        e.preventDefault();
        select(`${group}:${dateValue}`);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0) select(items[active].value);
    }
  };

  const chipStyle = value && color ? { backgroundColor: `${color}20`, borderColor: color } : {};

  return (
    <span ref={rootRef} className="relative inline-block mr-1 mb-1" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex items-center rounded-lg border py-0.5 px-2 whitespace-nowrap ${
          value
            ? 'bg-neutral-100 border-transparent'
            : 'bg-white border-dashed border-neutral-300 text-neutral-500 hover:bg-neutral-50'
        }`}
        style={chipStyle}
        onClick={toggle}
      >
        <span className="border-r border-neutral-300 pr-1 text-sm opacity-70">{group.replace(/@$/, '')}</span>
        <span className={`pl-2 ${value ? '' : 'text-neutral-400'}`}>{selectedName || '-'}</span>
        <span className="ml-1 text-xs text-neutral-400">▾</span>
      </button>

      {open && (
        <div className="absolute z-10 left-0 top-full mt-1 bg-white border rounded-sm shadow-md min-w-full max-h-64 overflow-auto whitespace-nowrap">
          {isDate ? (
            <div className="p-2 flex flex-col gap-1">
              <input
                type="date"
                className="border rounded-sm px-1 py-0.5"
                value={dateValue}
                autoFocus
                onChange={(e) => setDateValue(e.target.value)}
              />
              <div className="flex gap-1 justify-end">
                {value && (
                  <button
                    type="button"
                    className="border rounded-sm px-2 py-0.5 text-sm hover:bg-neutral-100"
                    onClick={() => select('')}
                  >
                    クリア
                  </button>
                )}
                <button
                  type="button"
                  className="bg-blue-600 text-white rounded-sm px-2 py-0.5 text-sm hover:bg-blue-700 disabled:opacity-50"
                  disabled={!dateValue}
                  onClick={() => select(`${group}:${dateValue}`)}
                >
                  設定
                </button>
              </div>
            </div>
          ) : (
            <div role="listbox" aria-label={group}>
              {items.map((option, index) => (
                <button
                  key={option.value || '-'}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  className={`block w-full text-left px-2 py-1 text-sm ${
                    index === active ? 'bg-blue-100' : option.value === value ? 'bg-blue-50' : ''
                  } ${option.value === '' ? 'text-neutral-400' : ''} hover:bg-neutral-100`}
                  onClick={() => select(option.value)}
                  onMouseEnter={() => setActive(index)}
                >
                  {option.label}
                  {option.note && <span className="text-neutral-400 ml-1">（{option.note}）</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </span>
  );
}

export default TagGroupSelect;
