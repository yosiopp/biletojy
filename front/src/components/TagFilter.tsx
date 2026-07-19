import { ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import type { Tag } from '../api/client';
import { t } from '../i18n';
import {
  buildCond,
  completeOnTab,
  completionCandidates,
  condGroup,
  groupCatalog,
  groupOptions,
  hierarchyOptions,
  isRangeGroup,
  normalizeTag,
  parseCond,
  parseTag,
  pendingRangeGroup,
  rangePickerValue,
  splitRangeValue,
  splitTags,
  tagColor,
} from '../lib/tags';
import { useTagColors } from '../lib/useCatalog';
import TagGroupSelect from './TagGroupSelect';
import TagItem from './TagItem';
import TagRangeInput from './TagRangeInput';

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
  onClick,
  children,
}: {
  label?: string;
  onRemove: () => void;
  // 指定すると内容部分がクリック（キーボードフォーカス）できるボタンになる
  onClick?: () => void;
  children: ReactNode;
}) {
  const content = onClick ? (
    <button type="button" className="hover:underline" onClick={onClick}>
      {children}
    </button>
  ) : (
    children
  );
  return (
    <span className="inline-flex items-center rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 py-0.5 px-2 whitespace-nowrap">
      {label && <span className="border-r border-neutral-300 dark:border-neutral-600 pr-1 text-sm text-neutral-500 dark:text-neutral-400">{label}</span>}
      <span className={label ? 'pl-2' : ''}>{content}</span>
      <button type="button" className="ml-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200" onClick={onRemove}>
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
  const [rangeValue, setRangeValue] = useState('');
  // クリックで値を編集中の日時・数値タグ条件（selected内のraw）とピッカーの値
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const groups = useMemo(() => groupCatalog(catalog), [catalog]);
  const colors = useTagColors(catalog);
  const hierarchies = useMemo(() => hierarchyOptions(catalog), [catalog]);

  // 日時・数値タグの値待ち状態（例: "due-date@:" "-estimate#:>="）なら日付ピッカー・数値入力を出す
  const rangeGroup = useMemo(() => pendingRangeGroup(text, true), [text]);

  const completions = useMemo(() => completionCandidates(catalog), [catalog]);

  // 絞り込みチップにするグループ（日時・数値グループと選択肢なしグループは除く）
  const filterGroups = useMemo(
    () => [...groups.entries()].filter(([group, tags]) => !isRangeGroup(group) && tags.length > 0),
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
    // ORの2つ目以降はグループ名を省略できる（status:WIP|CLOSED → status:WIP|status:CLOSED）
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

  // 値待ち状態のテキストをピッカーの値と結合して確定する
  const submitRange = () => {
    submit(text + rangeValue);
    setRangeValue('');
  };

  const closeEdit = useCallback(() => setEditing(null), []);

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
      <span className="relative block">
        <input
          ref={searchRef}
          type="search"
          className="border rounded-sm px-2 py-1 w-full"
          placeholder={t('tagFilter.placeholder')}
          list="tag-filter-suggestions"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              // 値待ち状態でピッカーに値が入っていれば結合して確定する
              if (rangeGroup && rangeValue) {
                submitRange();
              } else {
                submit(text);
              }
            }
            // Tabで前方一致するタグ候補の確定部分まで補完する（一意ならタグ全体まで）
            const completed = completeOnTab(e, text, completions);
            if (completed != null) setText(completed);
          }}
        />
        <datalist id="tag-filter-suggestions">
          {catalog.map((tag) => (
            <option key={tag.id} value={tag.tag} />
          ))}
        </datalist>

        {rangeGroup && (
          <TagRangeInput
            key={rangeGroup}
            group={rangeGroup}
            text={text}
            anchorRef={searchRef}
            value={rangeValue}
            onValueChange={setRangeValue}
            onTextChange={setText}
            operators
            onSubmit={() => {
              submitRange();
              searchRef.current?.focus();
            }}
            autoFocus={false}
          />
        )}
      </span>

      <div className="flex flex-wrap items-center gap-1 mt-2">
        <span className="text-sm text-neutral-500 dark:text-neutral-400">{t('tagFilter.filterLabel')}</span>

        {filterGroups.map(([group, tags]) => {
          const groupSelected = selectedInGroup(group);
          return (
            <TagGroupSelect
              key={group}
              group={group}
              options={groupOptions(tags)}
              value={groupSelected}
              color={tagColor(colors, groupSelected || `${group}:`)}
              onChange={(tag) => replaceGroupTag(group, tag)}
              filter
            />
          );
        })}

        {hierarchies.length > 0 && (
          <TagGroupSelect
            group={t('tagFilter.hierarchy')}
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
          // 単一条件の日時・数値タグは値部分のクリックでピッカーを開いて編集できる
          const single = alts.length === 1 ? parseTag(alts[0]) : null;
          const range = single != null && (single.isDate || single.isNumber) ? single : null;
          const startEdit = range
            ? () => {
                setEditValue(rangePickerValue(range.group ?? '', range.name));
                setEditing(cond);
              }
            : undefined;
          // 単純な条件は通常のタグチップで表示（色・期限表示を活かす）。NOT/OR条件は専用チップにする
          const chip =
            !not && alts.length === 1 ? (
              <TagItem tag={alts[0]} color={tagColor(colors, alts[0])} onRemove={remove} onClick={startEdit} />
            ) : (
              <ConditionChip label={not ? t('tagFilter.not') : undefined} onRemove={remove} onClick={startEdit}>
                {alts.join(' | ')}
              </ConditionChip>
            );
          return (
            <span key={cond} className="relative inline-block">
              {chip}
              {editing === cond && range && (
                <TagRangeInput
                  group={range.group ?? ''}
                  value={editValue}
                  onValueChange={setEditValue}
                  submitLabel={t('common.set')}
                  onSubmit={() => {
                    // 比較演算子は変えずに値だけ差し替える。同一条件が既にあれば重複させない
                    const [op] = splitRangeValue(range.name);
                    const next = buildCond(not, [`${range.group}:${op}${editValue}`]);
                    onChange([...new Set(selected.map((c) => (c === cond ? next : c)))]);
                    setEditing(null);
                  }}
                  onClose={closeEdit}
                />
              )}
            </span>
          );
        })}
        {queryWords.map((word) => (
          <ConditionChip
            key={word}
            label={t('tagFilter.fullText')}
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
