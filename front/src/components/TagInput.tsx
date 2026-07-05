import { useMemo, useState } from 'react';
import type { Tag } from '../api/client';
import {
  groupCatalog,
  groupOptions,
  hierarchyOptions,
  normalizeTag,
  parseTag,
  splitTags,
  tagColor,
} from '../lib/tags';
import TagGroupSelect from './TagGroupSelect';
import TagItem from './TagItem';

type Props = {
  value: string[];
  onChange: (tags: string[]) => void;
  catalog: Tag[];
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
function TagInput({ value, onChange, catalog }: Props) {
  const [text, setText] = useState('');
  const [rangeValue, setRangeValue] = useState('');
  const groups = useMemo(() => groupCatalog(catalog), [catalog]);

  const rangeGroup = useMemo(() => {
    const match = text.match(/^(.+[@#]):$/);
    return match ? match[1] : null;
  }, [text]);

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

  const suggestions = useMemo(() => {
    const options = new Set<string>(hierarchyOptions(catalog));
    for (const tag of catalog) {
      const { isDate, isNumber } = parseTag(tag.tag);
      if (!isDate && !isNumber) options.add(tag.tag);
    }
    return [...options].sort();
  }, [catalog]);

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
            color={tagColor(catalog, selected || `${group}:`)}
            onChange={(tag) => replaceGroupTag(group, tag)}
          />
        );
      })}

      {freeTags.map((tag) => (
        <TagItem
          key={tag}
          tag={tag}
          color={tagColor(catalog, tag)}
          onRemove={() => onChange(value.filter((v) => v !== tag))}
        />
      ))}

      <input
        type="text"
        className="border rounded-sm px-2 py-1 mb-1 flex-1 min-w-40"
        placeholder="タグを追加（Enterで確定）"
        list="tag-input-suggestions"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !rangeGroup) {
            e.preventDefault();
            addTag(text.trim());
            setText('');
          }
        }}
      />
      <datalist id="tag-input-suggestions">
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      {rangeGroup && (
        <span className="flex items-center gap-1 ml-1 mb-1">
          <input
            type={rangeGroup.endsWith('#') ? 'number' : 'date'}
            step={rangeGroup.endsWith('#') ? 'any' : undefined}
            className="border rounded-sm px-1 py-0.5"
            value={rangeValue}
            onChange={(e) => setRangeValue(e.target.value)}
          />
          <button
            type="button"
            className="border rounded-sm px-2 py-0.5 text-sm hover:bg-neutral-100"
            onClick={() => {
              if (!rangeValue) return;
              addTag(`${rangeGroup}:${rangeValue}`);
              setText('');
              setRangeValue('');
            }}
          >
            追加
          </button>
        </span>
      )}
    </div>
  );
}

export default TagInput;
