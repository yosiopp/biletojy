import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, Ticket } from '../api/client';
import ExportImport from '../components/ExportImport';
import TagFilter from '../components/TagFilter';
import TicketBoard from '../components/TicketBoard';
import TicketRow from '../components/TicketRow';
import TicketTree from '../components/TicketTree';
import ViewSelect from '../components/ViewSelect';
import { buildSort, HIERARCHY_SORT_KEY, parseSort, sortTickets, SortSpec } from '../lib/sort';
import { staleGuard } from '../lib/staleGuard';
import { groupCatalog, hierarchyOptions } from '../lib/tags';
import { useCatalog } from '../lib/useCatalog';
import { parseViewMode, VIEW_MODES, ViewMode } from '../lib/viewMode';

function TicketList() {
  const [searchParams, setSearchParams] = useSearchParams();
  // null はロード中（初回フェッチ完了前に空表示を出さないため）
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const catalog = useCatalog();
  const [error, setError] = useState('');
  // インポート完了の通知と、完了後に一覧を再取得するためのカウンタ
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);

  const q = searchParams.get('q') ?? '';
  const tagsParam = searchParams.get('tags') ?? '';
  const tags = tagsParam.split(',').filter((t) => t.length > 0);
  const hasFilter = q.length > 0 || tags.length > 0;
  const sort = parseSort(searchParams.get('sort'));
  // 表示モード（リスト / ツリー / カンバン）と表示対象（ツリーのルート階層タグ、カンバンの基準タググループ）
  const mode = parseViewMode(searchParams.get('view'));
  const by = searchParams.get('by') ?? '';

  // ソートキーに選べる日時・数値タググループ（例: due-date@, estimate#）。
  // URL直指定などでカタログに無いキーが来ても選択欄の表示が崩れないように含める
  const sortGroups = useMemo(() => {
    const groups = [...groupCatalog(catalog).keys()].filter((g) => /[@#]$/.test(g));
    if (/[@#]$/.test(sort.key) && !groups.includes(sort.key)) groups.push(sort.key);
    return groups;
  }, [catalog, sort.key]);

  useEffect(() => {
    // 検索条件が変わった後に古いレスポンスで上書きされないようにする
    // （ソートはクライアント側で行うため再取得しない）
    const { fresh, cancel } = staleGuard();
    api
      .listTickets(q, tagsParam.split(',').filter((t) => t.length > 0))
      .then(fresh(setTickets))
      .catch(fresh((e: Error) => setError(e.message)));
    return cancel;
  }, [q, tagsParam, reload]);

  // 表示対象の選択肢。ツリーはルートに選べる階層タグ（中間階層含む）、カンバンは基準に選べる
  // タググループ（日時・数値グループは値が離散でないため対象外）。
  // URL直指定でカタログに無い値が来ても選択欄の表示が崩れないように含める
  const byOptions = useMemo(() => {
    const options =
      mode === 'board'
        ? [...groupCatalog(catalog).keys()].filter((g) => !/[@#]$/.test(g))
        : hierarchyOptions(catalog).sort();
    if (by && !options.includes(by)) options.push(by);
    return options;
  }, [catalog, by, mode]);

  // 検索条件と表示モードをまとめてURLパラメータへ反映する（リスト表示は view / by を付けない）
  const applyView = (nextQ: string, nextTags: string[], nextMode: ViewMode, nextBy: string) => {
    const params = new URLSearchParams(searchParams);
    if (nextQ) params.set('q', nextQ);
    else params.delete('q');
    if (nextTags.length > 0) params.set('tags', nextTags.join(','));
    else params.delete('tags');
    if (nextMode !== 'list') params.set('view', nextMode);
    else params.delete('view');
    if (nextMode !== 'list' && nextBy) params.set('by', nextBy);
    else params.delete('by');
    setSearchParams(params);
  };

  const updateParams = (nextQ: string, nextTags: string[]) => applyView(nextQ, nextTags, mode, by);

  // カンバンでのタグ付け替えを一覧の再取得なしで反映する
  const replaceTicket = (updated: Ticket) =>
    setTickets((prev) => prev && prev.map((t) => (t.id === updated.id ? updated : t)));

  // ソート結果をメモ化し、3表示モードへ同じ参照を渡す（TicketTree / TicketBoard 内の useMemo を保つ）
  const sortedTickets = useMemo(
    () => (tickets == null ? null : sortTickets(tickets, sort)),
    // sort は毎レンダー新しいオブジェクトになるため、中身のプリミティブで比較する
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tickets, sort.key, sort.desc],
  );

  const updateSort = (next: SortSpec) => {
    const params = new URLSearchParams(searchParams);
    const value = buildSort(next);
    if (value) params.set('sort', value);
    else params.delete('sort');
    setSearchParams(params);
  };

  return (
    <>
      <TagFilter
        selected={tags}
        onChange={(next) => updateParams(q, next)}
        query={q}
        onQueryChange={(next) => updateParams(next, tags)}
        catalog={catalog}
      />

      {error && <p className="text-red-600 dark:text-red-400 mb-2">{error}</p>}
      {notice && <p className="text-blue-700 dark:text-blue-400 mb-2">{notice}</p>}

      <div className="flex flex-wrap items-start justify-between mb-2">
        <div className="flex flex-wrap items-center">
          <ViewSelect q={q} tags={tags} mode={mode} by={by} onApply={applyView} />
          <div className="inline-flex border rounded-sm text-sm mr-2 mb-1" role="group" aria-label="表示モード">
            {VIEW_MODES.map(({ value, label }, i) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                className={`px-2 py-0.5 ${i > 0 ? 'border-l' : ''} ${
                  mode === value
                    ? 'bg-neutral-200 dark:bg-neutral-600'
                    : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
                onClick={() => applyView(q, tags, value, value === mode ? by : '')}
              >
                {label}
              </button>
            ))}
          </div>
          {mode !== 'list' && (
            <label className="text-sm mb-1 text-neutral-500 dark:text-neutral-400">
              対象:{' '}
              <select
                className="border rounded-sm px-1 py-0.5 text-neutral-900 dark:text-neutral-100"
                value={by}
                onChange={(e) => applyView(q, tags, mode, e.target.value)}
              >
                <option value="">{mode === 'tree' ? 'すべて' : '-'}</option>
                {byOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor="ticket-sort" className="text-neutral-500 dark:text-neutral-400">
            並び替え:
          </label>
          <select
            id="ticket-sort"
            className="border rounded-sm px-1 py-0.5 -ml-1"
            value={sort.key}
            onChange={(e) => updateSort({ ...sort, key: e.target.value })}
          >
            <option value="updated">updated</option>
            <option value="id">id</option>
            <option value={HIERARCHY_SORT_KEY}>階層タグ</option>
            {sortGroups.map((group) => (
              <option key={group} value={group}>
                {group.replace(/[@#]$/, '')}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="border rounded-sm px-2 py-0.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            onClick={() => updateSort({ ...sort, desc: !sort.desc })}
          >
            {sort.desc ? '↓ 降順' : '↑ 昇順'}
          </button>
          <ExportImport
            q={q}
            tags={tags}
            onImported={(count) => {
              setNotice(`${count}件のチケットをインポートしました`);
              setError('');
              setReload((n) => n + 1);
            }}
            onError={(message) => {
              setError(message);
              setNotice('');
            }}
          />
        </div>
      </div>

      {mode === 'list' && (
        <div className="hidden sm:flex text-neutral-500 dark:text-neutral-400 border-b">
          <div className="flex-none w-16 py-1 pl-4">id</div>
          <div className="w-2/4 py-1">title</div>
          <div className="flex-1 py-1">tags</div>
          <div className="flex-none w-40 py-1 pr-4">updated</div>
        </div>
      )}
      {tickets == null && !error && <p className="text-neutral-500 dark:text-neutral-400 p-4">読み込み中...</p>}
      {sortedTickets != null && mode === 'list' &&
        sortedTickets.map((ticket) => (
          <TicketRow key={ticket.id} ticket={ticket} catalog={catalog} />
        ))}
      {sortedTickets != null && mode === 'tree' && sortedTickets.length > 0 && (
        <TicketTree tickets={sortedTickets} catalog={catalog} by={by} />
      )}
      {sortedTickets != null && mode === 'board' && sortedTickets.length > 0 && (
        by ? (
          <TicketBoard
            tickets={sortedTickets}
            catalog={catalog}
            by={by}
            onUpdated={replaceTicket}
            onError={setError}
          />
        ) : (
          <p className="text-neutral-500 dark:text-neutral-400 p-4">対象のタググループを選択してください</p>
        )
      )}
      {tickets != null && tickets.length === 0 && (
        <div className="text-neutral-500 dark:text-neutral-400 p-4">
          {hasFilter ? (
            <>
              条件に一致するチケットがありません
              <button
                type="button"
                className="text-blue-700 dark:text-blue-400 hover:underline ml-2"
                onClick={() => updateParams('', [])}
              >
                条件をクリア
              </button>
            </>
          ) : (
            <>
              チケットがありません
              <Link to="/tickets/new" className="text-blue-700 dark:text-blue-400 hover:underline ml-2">
                新規チケットを作成
              </Link>
            </>
          )}
        </div>
      )}
    </>
  );
}

export default TicketList;
