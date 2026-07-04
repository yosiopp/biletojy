import { useMemo, useState } from 'react';
import type { Tag } from '../api/client';
import { groupCatalog, hierarchyOptions, parseTag, tagColor } from '../lib/tags';
import TagItem from './TagItem';

type Props = {
  value: string[];
  onChange: (tags: string[]) => void;
  catalog: Tag[];
};

// チケットへのタグ付け入力
// - タググループはプルダウンで選択（同グループのタグは置き換え）
// - 末尾@のグループ（例: due-date@）は日時ピッカーで入力
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

  const suggestions = useMemo(() => {
    const options = new Set<string>(hierarchyOptions(catalog));
    for (const tag of catalog) {
      if (!parseTag(tag.tag).isDate) options.add(tag.tag);
    }
    return [...options].sort();
  }, [catalog]);

  return (
    <div>
      <div className="min-h-8 mb-2">
        {value.map((tag) => (
          <TagItem
            key={tag}
            tag={tag}
            color={tagColor(catalog, tag)}
            onRemove={() => onChange(value.filter((v) => v !== tag))}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {[...groups.entries()].map(([group, tags]) =>
          group.endsWith('@') ? (
            <label key={group} className="text-sm text-neutral-600">
              {group.replace(/@$/, '')}
              <input
                type="datetime-local"
                className="border rounded px-1 py-0.5 ml-1"
                value={parseTag(selectedInGroup(group)).name || ''}
                onChange={(e) => replaceGroupTag(group, e.target.value ? `${group}:${e.target.value}` : '')}
              />
            </label>
          ) : (
            <label key={group} className="text-sm text-neutral-600">
              {group}
              <select
                className="border rounded px-1 py-1 ml-1"
                value={selectedInGroup(group)}
                onChange={(e) => replaceGroupTag(group, e.target.value)}
              >
                <option value="">-</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.tag}>
                    {parseTag(tag.tag).name}
                    {tag.note ? `（${tag.note}）` : ''}
                  </option>
                ))}
              </select>
            </label>
          ),
        )}

        <input
          type="text"
          className="border rounded px-2 py-1 flex-1 min-w-40"
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
          <span className="flex items-center gap-1">
            <input
              type="datetime-local"
              className="border rounded px-1 py-0.5"
              value={dateValue}
              onChange={(e) => setDateValue(e.target.value)}
            />
            <button
              type="button"
              className="border rounded px-2 py-0.5 text-sm hover:bg-neutral-100"
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
    </div>
  );
}

export default TagInput;
