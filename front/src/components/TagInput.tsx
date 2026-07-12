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
  const inputRef = useRef<HTMLInputElement>(null);
  const groups = useMemo(() => groupCatalog(catalog), [catalog]);
  const colors = useTagColors(catalog);

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

  // datalistにはTab補完候補のうち `group:` の途中形を除いたタグ全体を出す
  const suggestions = useMemo(() => completions.filter((c) => !c.endsWith(':')).sort(), [completions]);

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

      <span className="relative mb-1 flex-1 min-w-40">
        <input
          ref={inputRef}
          type="text"
          className="border rounded-sm px-2 py-1 w-full"
          placeholder="タグを追加（Enterで確定）"
          list="tag-input-suggestions"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              // 値待ち状態ならピッカーの値で確定する
              if (rangeGroup) {
                submitRange();
              } else {
                addTag(text.trim());
                setText('');
              }
            }
            // Tabで前方一致するタグ候補の確定部分まで補完する（一意ならタグ全体まで）
            const completed = completeOnTab(e, text, completions);
            if (completed != null) setText(completed);
          }}
        />
        <datalist id="tag-input-suggestions">
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>

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
