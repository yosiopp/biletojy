import { useMemo, useState } from 'react';
import type { Tag } from '../api/client';
import { groupCatalog, hierarchyOptions, parseTag, tagColor } from '../lib/tags';
import TagGroupSelect from './TagGroupSelect';
import TagItem from './TagItem';

type Props = {
  value: string[];
  onChange: (tags: string[]) => void;
  catalog: Tag[];
};

// チケットへのタグ付け入力
// - タググループはチップとして表示し、クリックで選択肢のプルダウンが開く（同グループのタグは置き換え）
// - 末尾@のグループ（例: due-date@）はプルダウン内の日時ピッカーで入力
// - 自由入力欄では `xxx@:` と入力すると日時ピッカーが現れる
function TagInput({ value, onChange, catalog }: Props) {
  const [text, setText] = useState('');
  const [dateValue, setDateValue] = useState('');
  const groups = useMemo(() => groupCatalog(catalog), [catalog]);

  const dateGroup = useMemo(() => {
    const match = text.match(/^(.+@):$/);
    return match ? match[1] : null;
  }, [text]);

  const selectedInGroup = (group: string) =>
    value.find((tag) => parseTag(tag).group === group) ?? '';

  const replaceGroupTag = (group: string, tag: string) => {
    const rest = value.filter((v) => parseTag(v).group !== group);
    onChange(tag ? [...rest, tag] : rest);
  };

  const addTag = (tag: string) => {
    if (!tag || value.includes(tag)) return;
    const { group } = parseTag(tag);
    if (group) {
      replaceGroupTag(group, tag);
    } else {
      onChange([...value, tag]);
    }
  };

  // グループチップで表示されないタグ（自由タグ・カタログ外グループのタグ）
  const freeTags = value.filter((tag) => {
    const { group } = parseTag(tag);
    return group == null || !groups.has(group);
  });

  const suggestions = useMemo(() => {
    const options = new Set<string>(hierarchyOptions(catalog));
    for (const tag of catalog) {
      if (!parseTag(tag.tag).isDate) options.add(tag.tag);
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
            options={tags.map((t) => ({ value: t.tag, label: parseTag(t.tag).name, note: t.note }))}
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
          if (e.key === 'Enter' && !dateGroup) {
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

      {dateGroup && (
        <span className="flex items-center gap-1 ml-1 mb-1">
          <input
            type="datetime-local"
            className="border rounded-sm px-1 py-0.5"
            value={dateValue}
            onChange={(e) => setDateValue(e.target.value)}
          />
          <button
            type="button"
            className="border rounded-sm px-2 py-0.5 text-sm hover:bg-neutral-100"
            onClick={() => {
              if (!dateValue) return;
              addTag(`${dateGroup}:${dateValue}`);
              setText('');
              setDateValue('');
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
