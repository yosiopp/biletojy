import { useEffect, useMemo, useRef, useState } from 'react';
import type { Tag } from '../api/client';
import {
  completeOnTab,
  completionCandidates,
  groupCatalog,
  groupOptions,
  normalizeTag,
  parseTag,
  pendingRangeGroup,
  splitTags,
  tagColor,
} from '../lib/tags';
import { useTagColors } from '../lib/useCatalog';
import { useOutsideClick } from '../lib/useOutsideClick';
import TagGroupSelect from './TagGroupSelect';
import TagItem from './TagItem';
import TagRangeInput from './TagRangeInput';

type Props = {
  value: string[];
  onChange: (tags: string[]) => void;
  catalog: Tag[];
  // 未確定の入力テキストの変化を親へ知らせる（保存時の警告などに使う）
  onTextChange?: (text: string) => void;
};

// リストから同グループのタグを除き、指定タグに置き換える
function withGroupReplaced(list: string[], group: string, tag: string): string[] {
  const rest = list.filter((v) => parseTag(v).group !== group);
  return tag ? [...rest, tag] : rest;
}

// チケットへのタグ付け入力
// - タググループはチップとして表示し、クリックで選択肢のプルダウンが開く（同グループのタグは置き換え）
// - 末尾@のグループ（例: due-date@）はプルダウン内の日付ピッカー、末尾#（例: estimate#）は数値入力
// - 自由入力欄では `xxx@:` と入力すると日付ピッカー、`xxx#:` と入力すると数値入力が現れる
function TagInput({ value, onChange, catalog, onTextChange }: Props) {
  const [text, setTextState] = useState('');
  const [rangeValue, setRangeValue] = useState('');
  // 候補プルダウンの開閉と、キーボードでハイライト中の候補（-1はハイライトなし）
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const groups = useMemo(() => groupCatalog(catalog), [catalog]);
  const colors = useTagColors(catalog);

  useOutsideClick(rootRef, open ? () => setOpen(false) : undefined);

  // 未確定テキストの変更は常に親へも通知する
  const setText = (next: string) => {
    setTextState(next);
    onTextChange?.(next);
  };

  // アンマウント（ダイアログを閉じた場合など）で未確定テキストは破棄されるため、親の保持値もクリアする
  const onTextChangeRef = useRef(onTextChange);
  useEffect(() => {
    onTextChangeRef.current = onTextChange;
  });
  useEffect(() => () => onTextChangeRef.current?.(''), []);

  const rangeGroup = useMemo(() => pendingRangeGroup(text), [text]);

  const selectedInGroup = (group: string) =>
    value.find((tag) => parseTag(tag).group === group) ?? '';

  const replaceGroupTag = (group: string, tag: string) => {
    onChange(withGroupReplaced(value, group, tag));
  };

  const addTag = (raw: string) => {
    // 保存時にタグは空白区切りになるため、空白を含む入力は複数タグとして追加する
    let next = value;
    for (const token of splitTags(raw)) {
      // コロン抜けの日時・数値タグ（例: due-date@2026-07-01）を正しい形式に補正する
      const tag = normalizeTag(token, groups.keys());
      if (next.includes(tag)) continue;
      const { group } = parseTag(tag);
      if (group) {
        // 同グループの既存タグは置き換える
        next = withGroupReplaced(next, group, tag);
      } else {
        next = [...next, tag];
      }
    }
    if (next !== value) onChange(next);
  };

  // グループチップで表示されないタグ（自由タグ・カタログ外グループのタグ）
  const freeTags = value.filter((tag) => {
    const { group } = parseTag(tag);
    return group == null || !groups.has(group);
  });

  const completions = useMemo(() => completionCandidates(catalog), [catalog]);

  // 候補プルダウンに出すタグ（Tab補完候補のうち `group:` の途中形を除いたタグ全体）に
  // 表示用の色とnoteを添える
  const displayCandidates = useMemo(() => {
    const notes = new Map(catalog.map((t) => [t.tag, t.note] as const));
    return completions
      .filter((c) => !c.endsWith(':'))
      .sort()
      .map((tag) => ({ tag, note: notes.get(tag) ?? null, color: tagColor(colors, tag) }));
  }, [completions, catalog, colors]);

  // 入力末尾のトークン（空白・"|"区切り、先頭の"-"は除外記法なので外す）に前方一致し、
  // かつ未追加の候補だけを表示する。値待ち状態のときは候補ではなくピッカーを出すので閉じる
  const matches = useMemo(() => {
    const [tail] = text.match(/[^\s|]*$/) ?? [''];
    const token = text.length === tail.length && tail.startsWith('-') ? tail.slice(1) : tail;
    return displayCandidates.filter((c) => c.tag.startsWith(token) && !value.includes(c.tag));
  }, [text, displayCandidates, value]);

  const showList = open && !rangeGroup && matches.length > 0;

  // 候補を確定してタグに追加する。入力欄は空に戻し、続けて入力できるようフォーカスを残す
  const pickCandidate = (tag: string) => {
    addTag(tag);
    setText('');
    setActive(-1);
    inputRef.current?.focus();
  };

  // 値待ち状態のグループタグ（rangeGroup）をピッカーの値で確定する。値が未入力なら何もしない
  const submitRange = () => {
    if (!rangeValue) return;
    addTag(`${rangeGroup}:${rangeValue}`);
    setText('');
    setRangeValue('');
  };

  return (
    <div className="flex flex-wrap items-center">
      {[...groups.entries()].map(([group, tags]) => {
        const selected = selectedInGroup(group);
        return (
          <TagGroupSelect
            key={group}
            group={group}
            options={groupOptions(tags)}
            value={selected}
            color={tagColor(colors, selected || `${group}:`)}
            onChange={(tag) => replaceGroupTag(group, tag)}
          />
        );
      })}

      {freeTags.map((tag) => (
        <TagItem
          key={tag}
          tag={tag}
          color={tagColor(colors, tag)}
          onRemove={() => onChange(value.filter((v) => v !== tag))}
        />
      ))}

      <span ref={rootRef} className="relative mb-1 flex-1 min-w-40">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls="tag-input-listbox"
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `tag-opt-${active}` : undefined}
          className="border rounded-sm px-2 py-1 w-full"
          placeholder="タグを追加（Enterで確定）"
          value={text}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setText(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              // 値待ち状態ならピッカーの値で確定する
              if (rangeGroup) {
                submitRange();
              } else if (showList && active >= 0 && matches[active]) {
                // 候補をハイライト中ならそれを確定、そうでなければ入力テキストを確定
                pickCandidate(matches[active].tag);
              } else {
                addTag(text.trim());
                setText('');
                setActive(-1);
              }
              return;
            }
            if (e.key === 'Escape') {
              // 候補が開いている間だけEscで閉じ、ダイアログ側へは伝えない
              if (open) {
                e.stopPropagation();
                setOpen(false);
                setActive(-1);
              }
              return;
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              if (!open) setOpen(true);
              else if (matches.length > 0) setActive((i) => (i < 0 ? 0 : Math.min(i + 1, matches.length - 1)));
              return;
            }
            if (e.key === 'ArrowUp') {
              if (open && matches.length > 0) {
                e.preventDefault();
                setActive((i) => (i <= 0 ? 0 : i - 1));
              }
              return;
            }
            // Tabで前方一致するタグ候補の確定部分まで補完する（一意ならタグ全体まで）
            const completed = completeOnTab(e, text, completions);
            if (completed != null) {
              setText(completed);
              setActive(-1);
            }
          }}
        />

        {showList && (
          <div
            id="tag-input-listbox"
            role="listbox"
            aria-label="タグ候補"
            className="absolute z-10 left-0 top-full mt-1 bg-white dark:bg-neutral-800 border rounded-sm shadow-md min-w-full max-h-64 overflow-auto whitespace-nowrap"
          >
            {matches.map((c, i) => (
              <button
                key={c.tag}
                id={`tag-opt-${i}`}
                type="button"
                role="option"
                aria-selected={i === active}
                className={`flex w-full items-center gap-1 text-left px-2 py-1 text-sm ${
                  i === active ? 'bg-blue-100 dark:bg-blue-900' : ''
                } hover:bg-neutral-100 dark:hover:bg-neutral-700`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickCandidate(c.tag)}
              >
                <TagItem tag={c.tag} color={c.color} />
                {c.note && <span className="text-neutral-400">（{c.note}）</span>}
              </button>
            ))}
          </div>
        )}

        {rangeGroup && (
          <TagRangeInput
            key={rangeGroup}
            group={rangeGroup}
            text={text}
            anchorRef={inputRef}
            value={rangeValue}
            onValueChange={setRangeValue}
            onTextChange={setText}
            onSubmit={() => {
              submitRange();
              inputRef.current?.focus();
            }}
          />
        )}
      </span>
    </div>
  );
}

export default TagInput;
