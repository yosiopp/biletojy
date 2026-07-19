import { KeyboardEvent as ReactKeyboardEvent, useRef, useState } from 'react';
import { t } from '../i18n';
import { buildCond, isRangeGroup, parseCond, parseTag, rangePickerValue, stripRangeMark } from '../lib/tags';
import { useOutsideClick } from '../lib/useOutsideClick';

export type TagGroupOption = {
  value: string; // 選択時に onChange へ渡す値（"status:OPEN" 形式）
  label: string;
  note?: string | null;
};

type Props = {
  group: string; // "status" や "due-date@"
  options: TagGroupOption[];
  value: string; // 選択中の条件（"status:OPEN"、OR: "status:OPEN|status:WIP"、NOT: "-status:CLOSED"）。未選択は ''
  color?: string | null;
  onChange: (cond: string) => void; // '' でクリア
  // 検索条件として使うときtrue。OR（複数選択）と除外（NOT）はチケットに保存できない
  // 検索専用の記法なので、falseのときは単一選択のみ（選択で閉じる・除外行なし）
  filter?: boolean;
};

// タググループのチップ。チップ自体をクリックすると選択肢のプルダウンが開く
// filter時は選択肢を複数選択するとOR条件になり、「除外」を選ぶとNOT条件になる
// 末尾@のグループは選択肢の代わりに日付ピッカー、末尾#のグループは数値入力を表示する
// キーボード: ↑↓で移動、Enter/Spaceで選択肢を選択（filter時はトグル）、Escで閉じる
function TagGroupSelect({ group, options, value, color, onChange, filter = false }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [rangeValue, setRangeValue] = useState('');
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isDate = group.endsWith('@');
  const isRange = isRangeGroup(group);
  const { not, alts } = parseCond(value);
  const chipLabel = alts.map((a) => parseTag(a).name).join('|');
  // 除外条件は "-status:CLOSED" の記法に合わせて "-" をグループ名の前に表示する
  const groupLabel = (not ? '-' : '') + stripRangeMark(group);

  // キーボード移動の対象: 0=クリア、1..n=選択肢、（filter時のみ）n+1=除外トグル
  const lastIndex = options.length + (filter ? 1 : 0);

  useOutsideClick(rootRef, open ? () => setOpen(false) : undefined);

  const toggle = () => {
    // 日時タグは既存タグに時刻付きの値（例: 2026-07-04T10:00）が残っていても日付部分だけをピッカーに渡す
    if (isRange) {
      const name = alts.length > 0 ? parseTag(alts[0]).name : '';
      setRangeValue(rangePickerValue(group, name));
    }
    setActive(open ? -1 : Math.max(options.findIndex((o) => alts.includes(o.value)) + 1, 0));
    setOpen(!open);
  };

  const select = (cond: string) => {
    onChange(cond);
    setOpen(false);
    setActive(-1);
  };

  // 選択肢の選択。filter時はトグルで複数選択（OR条件）になりプルダウンは開いたまま、
  // 非filter時は単一選択して閉じる
  const pick = (tag: string) => {
    if (!filter) {
      select(tag);
      return;
    }
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
    } else if (isRange) {
      if (e.key === 'Enter' && rangeValue) {
        e.preventDefault();
        select(`${group}:${rangeValue}`);
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
      } else if (filter && active === lastIndex) {
        toggleNot();
      } else if (active > 0) {
        pick(options[active - 1].value);
      }
    }
  };

  const chipStyle = value && color ? { backgroundColor: `${color}20`, borderColor: color } : {};

  return (
    <span ref={rootRef} className="relative inline-block" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex items-center rounded-lg border py-0.5 px-2 whitespace-nowrap ${
          value
            ? 'bg-neutral-100 dark:bg-neutral-700 border-transparent'
            : 'bg-white dark:bg-neutral-900 border-dashed border-neutral-300 dark:border-neutral-600 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800'
        }`}
        style={chipStyle}
        onClick={toggle}
      >
        <span className="border-r border-neutral-300 dark:border-neutral-600 pr-1 text-sm opacity-70">{groupLabel}</span>
        <span className={`pl-2 ${value ? '' : 'text-neutral-400'}`}>{chipLabel || '-'}</span>
        <span className="ml-1 text-xs text-neutral-400">▾</span>
      </button>

      {open && (
        <div className="absolute z-10 left-0 top-full mt-1 bg-white dark:bg-neutral-800 border rounded-sm shadow-md min-w-full max-h-64 overflow-auto whitespace-nowrap">
          {isRange ? (
            <div className="p-2 flex flex-col gap-1">
              <input
                type={isDate ? 'date' : 'number'}
                step={isDate ? undefined : 'any'}
                className="border rounded-sm px-1 py-0.5"
                value={rangeValue}
                autoFocus
                onChange={(e) => setRangeValue(e.target.value)}
              />
              <div className="flex gap-1 justify-end">
                {value && (
                  <button
                    type="button"
                    className="border rounded-sm px-2 py-0.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700"
                    onClick={() => select('')}
                  >
                    {t('common.clear')}
                  </button>
                )}
                <button
                  type="button"
                  className="bg-blue-600 text-white rounded-sm px-2 py-0.5 text-sm hover:bg-blue-700 disabled:opacity-50"
                  disabled={!rangeValue}
                  onClick={() => select(`${group}:${rangeValue}`)}
                >
                  {t('common.set')}
                </button>
              </div>
            </div>
          ) : (
            <div role="listbox" aria-label={group} aria-multiselectable={filter}>
              <button
                type="button"
                role="option"
                aria-selected={value === ''}
                className={`block w-full text-left px-2 py-1 text-sm text-neutral-400 ${
                  active === 0 ? 'bg-blue-100 dark:bg-blue-900' : ''
                } hover:bg-neutral-100 dark:hover:bg-neutral-700`}
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
                      index === active ? 'bg-blue-100 dark:bg-blue-900' : checked ? 'bg-blue-50 dark:bg-blue-950' : ''
                    } hover:bg-neutral-100 dark:hover:bg-neutral-700`}
                    onClick={() => pick(option.value)}
                    onMouseEnter={() => setActive(index)}
                  >
                    <span className="inline-block w-4 text-blue-700 dark:text-blue-400">{checked ? '✓' : ''}</span>
                    {option.label}
                    {option.note && <span className="text-neutral-400 ml-1">（{option.note}）</span>}
                  </button>
                );
              })}
              {filter && (
                <button
                  type="button"
                  className={`block w-full text-left px-2 py-1 text-sm border-t ${
                    active === lastIndex ? 'bg-blue-100 dark:bg-blue-900' : ''
                  } ${alts.length === 0 ? 'text-neutral-300 dark:text-neutral-600' : ''} hover:bg-neutral-100 dark:hover:bg-neutral-700`}
                  onClick={toggleNot}
                  onMouseEnter={() => setActive(lastIndex)}
                >
                  <span className="inline-block w-4 text-blue-700 dark:text-blue-400">{not ? '✓' : ''}</span>
                  {t('tagGroupSelect.exclude')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </span>
  );
}

export default TagGroupSelect;
