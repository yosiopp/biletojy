import { useMemo, useState } from 'react';
import type { Tag } from '../api/client';
import { groupCatalog, hierarchyOptions, parseTag, tagColor } from '../lib/tags';
import TagItem from './TagItem';

type Props = {
  selected: string[];
  onChange: (tags: string[]) => void;
  catalog: Tag[];
};

// チケット一覧の絞り込み
// - タググループと階層タグはプルダウンで選択
// - 階層タグは中間階層を選ぶと配下すべてにマッチ（前方一致）
function TagFilter({ selected, onChange, catalog }: Props) {
  const [text, setText] = useState('');
  const groups = useMemo(() => groupCatalog(catalog), [catalog]);
  const hierarchies = useMemo(() => hierarchyOptions(catalog), [catalog]);

  const addTag = (tag: string) => {
    if (!tag || selected.includes(tag)) return;
    onChange([...selected, tag]);
  };

  return (
    <div className="border rounded p-2 mb-2">
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm text-neutral-500">絞り込み:</span>

        {[...groups.entries()]
          .filter(([group, tags]) => !group.endsWith('@') && tags.length > 0)
          .map(([group, tags]) => (
            <label key={group} className="text-sm text-neutral-600">
              {group}
              <select
                className="border rounded px-1 py-1 ml-1"
                value={selected.find((t) => parseTag(t).group === group) ?? ''}
                onChange={(e) => {
                  const rest = selected.filter((t) => parseTag(t).group !== group);
                  onChange(e.target.value ? [...rest, e.target.value] : rest);
                }}
              >
                <option value="">-</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.tag}>
                    {parseTag(tag.tag).name}
                  </option>
                ))}
              </select>
            </label>
          ))}

        {hierarchies.length > 0 && (
          <label className="text-sm text-neutral-600">
            階層
            <select
              className="border rounded px-1 py-1 ml-1"
              value=""
              onChange={(e) => addTag(e.target.value)}
            >
              <option value="">-</option>
              {hierarchies.map((h) => (
                <option key={h} value={h}>
                  {' '.repeat((h.split('/').length - 1) * 2)}
                  {h}
                </option>
              ))}
            </select>
          </label>
        )}

        <input
          type="text"
          className="border rounded px-2 py-1 min-w-40"
          placeholder="タグで絞り込み（Enter）"
          list="tag-filter-suggestions"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag(text.trim());
              setText('');
            }
          }}
        />
        <datalist id="tag-filter-suggestions">
          {catalog.map((tag) => (
            <option key={tag.id} value={tag.tag} />
          ))}
        </datalist>
      </div>

      {selected.length > 0 && (
        <div className="mt-2">
          {selected.map((tag) => (
            <TagItem
              key={tag}
              tag={tag}
              color={tagColor(catalog, tag)}
              onRemove={() => onChange(selected.filter((t) => t !== tag))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default TagFilter;
