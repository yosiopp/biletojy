import { useMemo, useState } from 'react';
import type { Tag } from '../api/client';
import { groupCatalog, hierarchyOptions, parseTag, tagColor } from '../lib/tags';
import TagGroupSelect from './TagGroupSelect';
import TagItem from './TagItem';

type Props = {
  selected: string[];
  onChange: (tags: string[]) => void;
  query: string;
  onQueryChange: (query: string) => void;
  catalog: Tag[];
};

// チケット一覧の絞り込み・全文検索バー
// - タググループはチップとして表示し、クリックで選択肢のプルダウンが開く
// - 階層タグも「階層」チップのプルダウンから選択。中間階層を選ぶと配下すべてにマッチ（前方一致）
// - 入力欄は共通: 既存のタグ・階層・グループ値ならタグ絞り込み、それ以外は全文検索ワードになる
function TagFilter({ selected, onChange, query, onQueryChange, catalog }: Props) {
  const [text, setText] = useState('');
  const groups = useMemo(() => groupCatalog(catalog), [catalog]);
  const hierarchies = useMemo(() => hierarchyOptions(catalog), [catalog]);

  // 絞り込みチップにするグループ（日時グループと選択肢なしグループは除く）
  const filterGroups = useMemo(
    () => [...groups.entries()].filter(([group, tags]) => !group.endsWith('@') && tags.length > 0),
    [groups],
  );

  const queryWords = query.split(/\s+/).filter((w) => w.length > 0);

  const addTag = (tag: string) => {
    if (!tag || selected.includes(tag)) return;
    onChange([...selected, tag]);
  };

  // 入力値をタグ絞り込みとして扱えるか（カタログ一致・階層・既存グループの値指定）
  const isTagQuery = (input: string) => {
    if (catalog.some((t) => t.tag === input)) return true;
    if (hierarchies.includes(input)) return true;
    const { group } = parseTag(input);
    return group != null && groups.has(group);
  };

  const submit = (raw: string) => {
    const input = raw.trim();
    if (!input) return;
    if (isTagQuery(input)) {
      addTag(input);
    } else {
      const words = input.split(/\s+/).filter((w) => !queryWords.includes(w));
      if (words.length > 0) onQueryChange([...queryWords, ...words].join(' '));
    }
    setText('');
  };

  const selectedInGroup = (group: string) =>
    selected.find((tag) => parseTag(tag).group === group) ?? '';

  const replaceGroupTag = (group: string, tag: string) => {
    const rest = selected.filter((t) => parseTag(t).group !== group);
    onChange(tag ? [...rest, tag] : rest);
  };

  // グループチップで表示されないタグ（階層・自由入力など）
  const chipGroups = useMemo(() => new Set(filterGroups.map(([group]) => group)), [filterGroups]);
  const restTags = selected.filter((tag) => {
    const { group } = parseTag(tag);
    return group == null || !chipGroups.has(group);
  });

  return (
    <div className="border rounded-sm p-2 mb-2">
      <input
        type="search"
        className="border rounded-sm px-2 py-1 w-full"
        placeholder="タグまたは全文検索（タイトル・本文・コメント / Enterで確定）"
        list="tag-filter-suggestions"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit(text);
          }
        }}
      />
      <datalist id="tag-filter-suggestions">
        {catalog.map((tag) => (
          <option key={tag.id} value={tag.tag} />
        ))}
      </datalist>

      <div className="flex flex-wrap items-center mt-2">
        <span className="text-sm text-neutral-500 mr-1 mb-1">絞り込み:</span>

        {filterGroups.map(([group, tags]) => {
          const groupSelected = selectedInGroup(group);
          return (
            <TagGroupSelect
              key={group}
              group={group}
              options={tags.map((t) => ({ value: t.tag, label: parseTag(t.tag).name, note: t.note }))}
              value={groupSelected}
              color={tagColor(catalog, groupSelected || `${group}:`)}
              onChange={(tag) => replaceGroupTag(group, tag)}
            />
          );
        })}

        {hierarchies.length > 0 && (
          <TagGroupSelect
            group="階層"
            options={hierarchies.map((h) => ({
              value: h,
              label: '\u00A0'.repeat((h.split('/').length - 1) * 2) + h,
            }))}
            value=""
            onChange={addTag}
          />
        )}

        {restTags.map((tag) => (
          <TagItem
            key={tag}
            tag={tag}
            color={tagColor(catalog, tag)}
            onRemove={() => onChange(selected.filter((t) => t !== tag))}
          />
        ))}
        {queryWords.map((word) => (
          <span
            key={word}
            className="inline-flex items-center rounded-lg border border-neutral-300 bg-white py-0.5 px-2 mr-1 mb-1 whitespace-nowrap"
          >
            <span className="border-r border-neutral-300 pr-1 text-sm text-neutral-500">全文</span>
            <span className="pl-2">{word}</span>
            <button
              type="button"
              className="ml-1 text-neutral-400 hover:text-neutral-700"
              onClick={() => onQueryChange(queryWords.filter((w) => w !== word).join(' '))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

export default TagFilter;
