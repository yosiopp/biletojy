import { KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from 'react';
import { buildCond, parseCond, parseTag } from '../lib/tags';

export type TagGroupOption = {
  value: string; // 選択時に onChange へ渡す値（"status:OPEN" 形式）
  label: string;
  note?: string | null;
};

type Props = {
  group: string; // "status" や "due-date@"
  options: TagGroupOption[];
  value: string; // 選択中の条件（"status:OPEN"、OR: "status:OPEN|status:WIP"、NOT: "-status:CLOSE"）。未選択は ''
  color?: string | null;
  onChange: (cond: string) => void; // '' でクリア
};

// タググループのチップ。チップ自体をクリックすると選択肢のプルダウンが開く
// 選択肢は複数選択するとOR条件になり、「除外」を選ぶとNOT条件になる
// 末尾@のグループは選択肢の代わりに日付ピッカーを表示する
// キーボード: ↑↓で移動、Enter/Spaceで選択肢をトグル、Escで閉じる
function TagGroupSelect({ group, options, value, color, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [dateValue, setDateValue] = useState('');
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isDate = group.endsWith('@');
  const { not, alts } = parseCond(value);
  const chipLabel = alts.map((a) => parseTag(a).name).join('|');
  // 除外条件は "-status:CLOSE" の記法に合わせて "-" をグループ名の前に表示する
  const groupLabel = (not ? '-' : '') + group.replace(/@$/, '');

  // キーボード移動の対象: 0=クリア、1..n=選択肢、n+1=除外トグル
  const lastIndex = options.length + 1;

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
    if (isDate) setDateValue(alts.length > 0 ? parseTag(alts[0]).name.slice(0, 10) : '');
    setActive(open ? -1 : Math.max(options.findIndex((o) => alts.includes(o.value)) + 1, 0));
    setOpen(!open);
  };

  const select = (cond: string) => {
    onChange(cond);
    setOpen(false);
    setActive(-1);
  };

  // 選択肢のトグル。複数選択でOR条件になる（プルダウンは開いたまま）
  const toggleAlt = (tag: string) => {
    const next = alts.includes(tag) ? alts.filter((a) => a !== tag) : [...alts, tag];
    onChange(buildCond(not, next));
  };

  const toggleNot = () => {
    if (alts.length > 0) onChange(buildCond(!not, alts));
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
      setActive((i) => Math.min(i + 1, lastIndex));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (active === 0) {
        select('');
      } else if (active === lastIndex) {
        toggleNot();
      } else if (active > 0) {
        toggleAlt(options[active - 1].value);
      }
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
        <span className="border-r border-neutral-300 pr-1 text-sm opacity-70">{groupLabel}</span>
        <span className={`pl-2 ${value ? '' : 'text-neutral-400'}`}>{chipLabel || '-'}</span>
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
            <div role="listbox" aria-label={group} aria-multiselectable="true">
              <button
                type="button"
                role="option"
                aria-selected={value === ''}
                className={`block w-full text-left px-2 py-1 text-sm text-neutral-400 ${
                  active === 0 ? 'bg-blue-100' : ''
                } hover:bg-neutral-100`}
                onClick={() => select('')}
                onMouseEnter={() => setActive(0)}
              >
                <span className="inline-block w-4" />-
              </button>
              {options.map((option, i) => {
                const index = i + 1;
                const checked = alts.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={checked}
                    className={`block w-full text-left px-2 py-1 text-sm ${
                      index === active ? 'bg-blue-100' : checked ? 'bg-blue-50' : ''
                    } hover:bg-neutral-100`}
                    onClick={() => toggleAlt(option.value)}
                    onMouseEnter={() => setActive(index)}
                  >
                    <span className="inline-block w-4 text-blue-700">{checked ? '✓' : ''}</span>
                    {option.label}
                    {option.note && <span className="text-neutral-400 ml-1">（{option.note}）</span>}
                  </button>
                );
              })}
              <button
                type="button"
                className={`block w-full text-left px-2 py-1 text-sm border-t ${
                  active === lastIndex ? 'bg-blue-100' : ''
                } ${alts.length === 0 ? 'text-neutral-300' : ''} hover:bg-neutral-100`}
                onClick={toggleNot}
                onMouseEnter={() => setActive(lastIndex)}
              >
                <span className="inline-block w-4 text-blue-700">{not ? '✓' : ''}</span>
                除外（マッチしないもの）
              </button>
            </div>
          )}
        </div>
      )}
    </span>
  );
}

export default TagGroupSelect;
