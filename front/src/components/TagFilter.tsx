import { ReactNode, useMemo, useState } from 'react';
import type { Tag } from '../api/client';
import {
  buildCond,
  condGroup,
  groupCatalog,
  groupOptions,
  hierarchyOptions,
  normalizeTag,
  parseCond,
  parseTag,
  splitTags,
  tagColor,
} from '../lib/tags';
import TagGroupSelect from './TagGroupSelect';
import TagItem from './TagItem';

type Props = {
  selected: string[];
  onChange: (tags: string[]) => void;
  query: string;
  onQueryChange: (query: string) => void;
  catalog: Tag[];
};

// NOT/OR条件・全文検索ワード用のチップ。labelがあれば区切り線付きの前置ラベルを表示する
function ConditionChip({
  label,
  onRemove,
  children,
}: {
  label?: string;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center rounded-lg border border-neutral-300 bg-white py-0.5 px-2 mr-1 mb-1 whitespace-nowrap">
      {label && <span className="border-r border-neutral-300 pr-1 text-sm text-neutral-500">{label}</span>}
      <span className={label ? 'pl-2' : ''}>{children}</span>
      <button type="button" className="ml-1 text-neutral-400 hover:text-neutral-700" onClick={onRemove}>
        ×
      </button>
    </span>
  );
}

// チケット一覧の絞り込み・全文検索バー
// - タググループはチップとして表示し、クリックで選択肢のプルダウンが開く（複数選択でOR、「除外」でNOT）
// - 階層タグも「階層」チップのプルダウンから選択。中間階層を選ぶと配下すべてにマッチ（前方一致）
// - 入力欄は共通: 既存のタグ・階層・グループ値ならタグ絞り込み、それ以外は全文検索ワードになる
//   タグ絞り込みは先頭 - で除外（NOT）、| 区切りでOR条件を指定できる
function TagFilter({ selected, onChange, query, onQueryChange, catalog }: Props) {
  const [text, setText] = useState('');
  const groups = useMemo(() => groupCatalog(catalog), [catalog]);
  const hierarchies = useMemo(() => hierarchyOptions(catalog), [catalog]);

  // 絞り込みチップにするグループ（日時・数値グループと選択肢なしグループは除く）
  const filterGroups = useMemo(
    () => [...groups.entries()].filter(([group, tags]) => !/[@#]$/.test(group) && tags.length > 0),
    [groups],
  );

  const queryWords = splitTags(query);

  const addTag = (tag: string) => {
    if (!tag || selected.includes(tag)) return;
    onChange([...selected, tag]);
  };

  // タグ1つ分をタグ絞り込みとして扱えるか（カタログ一致・階層・既存グループの値指定）
  const isTagQuery = (input: string) => {
    if (catalog.some((t) => t.tag === input)) return true;
    if (hierarchies.includes(input)) return true;
    const { group } = parseTag(input);
    return group != null && groups.has(group);
  };

  const submit = (raw: string) => {
    const input = raw.trim();
    if (!input) return;
    // 先頭 - は除外、| 区切りはOR条件。各択のコロン抜け日時タグ（例: due-date@2026-07-01）を補正する
    const { not, alts } = parseCond(input);
    const normalized = alts.map((a) => normalizeTag(a, groups.keys()));
    // ORの2つ目以降はグループ名を省略できる（status:WIP|CLOSE → status:WIP|status:CLOSE）
    // 単体で有効なタグはそのまま優先し、無効なときだけ直前の択のグループで補完する
    let lastGroup: string | null = null;
    const expanded = normalized.map((a) => {
      const { group } = parseTag(a);
      if (group != null) {
        lastGroup = group;
        return a;
      }
      if (!isTagQuery(a) && lastGroup != null && isTagQuery(`${lastGroup}:${a}`)) {
        return `${lastGroup}:${a}`;
      }
      return a;
    });
    if (expanded.length > 0 && expanded.every(isTagQuery)) {
      addTag(buildCond(not, expanded));
    } else {
      const words = splitTags(input).filter((w) => !queryWords.includes(w));
      if (words.length > 0) onQueryChange([...queryWords, ...words].join(' '));
    }
    setText('');
  };

  // グループのチップが担当する条件（すべての択がそのグループの値のもの）
  const selectedInGroup = (group: string) =>
    selected.find((cond) => condGroup(cond) === group) ?? '';

  // チップが表示している条件（グループ内の先頭の1件）だけを差し替える
  // 同グループの別条件（個別に追加した除外条件など）は消さない
  const replaceGroupTag = (group: string, cond: string) => {
    const current = selected.find((c) => condGroup(c) === group);
    const rest = selected.filter((c) => c !== current);
    onChange(cond ? [...rest, cond] : rest);
  };

  // グループチップで表示されない条件（階層・自由入力・グループを跨ぐORなど）
  const chipConds = new Set(filterGroups.map(([group]) => selectedInGroup(group)).filter((c) => c !== ''));
  const restTags = selected.filter((cond) => !chipConds.has(cond));

  return (
    <div className="border rounded-sm p-2 mb-2">
      <input
        type="search"
        className="border rounded-sm px-2 py-1 w-full"
        placeholder="タグまたは全文検索（タイトル・本文・コメント / -タグで除外、タグ|タグでOR / Enterで確定）"
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
              options={groupOptions(tags)}
              value={groupSelected}
              color={tagColor(catalog, groupSelected || `${group}:`)}
              onChange={(tag) => replaceGroupTag(group, tag)}
              filter
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
            filter
          />
        )}

        {restTags.map((cond) => {
          const { not, alts } = parseCond(cond);
          const remove = () => onChange(selected.filter((t) => t !== cond));
          // 単純な条件は通常のタグチップで表示（色・期限表示を活かす）。NOT/OR条件は専用チップにする
          if (!not && alts.length === 1) {
            return <TagItem key={cond} tag={alts[0]} color={tagColor(catalog, alts[0])} onRemove={remove} />;
          }
          return (
            <ConditionChip key={cond} label={not ? '除外' : undefined} onRemove={remove}>
              {alts.join(' | ')}
            </ConditionChip>
          );
        })}
        {queryWords.map((word) => (
          <ConditionChip
            key={word}
            label="全文"
            onRemove={() => onQueryChange(queryWords.filter((w) => w !== word).join(' '))}
          >
            {word}
          </ConditionChip>
        ))}
      </div>
    </div>
  );
}

export default TagFilter;
