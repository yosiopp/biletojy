import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, Ticket } from '../api/client';
import TagFilter from '../components/TagFilter';
import TicketRow from '../components/TicketRow';
import ViewSelect from '../components/ViewSelect';
import { buildSort, parseSort, sortTickets, SortSpec } from '../lib/sort';
import { staleGuard } from '../lib/staleGuard';
import { groupCatalog } from '../lib/tags';
import { useCatalog } from '../lib/useCatalog';

function TicketList() {
  const [searchParams, setSearchParams] = useSearchParams();
  // null はロード中（初回フェッチ完了前に空表示を出さないため）
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const catalog = useCatalog();
  const [error, setError] = useState('');

  const q = searchParams.get('q') ?? '';
  const tagsParam = searchParams.get('tags') ?? '';
  const tags = tagsParam.split(',').filter((t) => t.length > 0);
  const hasFilter = q.length > 0 || tags.length > 0;
  const sort = parseSort(searchParams.get('sort'));

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
  }, [q, tagsParam]);

  const updateParams = (nextQ: string, nextTags: string[]) => {
    const params = new URLSearchParams(searchParams);
    if (nextQ) params.set('q', nextQ);
    else params.delete('q');
    if (nextTags.length > 0) params.set('tags', nextTags.join(','));
    else params.delete('tags');
    setSearchParams(params);
  };

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

      {error && <p className="text-red-600 mb-2">{error}</p>}

      <div className="flex flex-wrap items-start justify-between mb-2">
        <ViewSelect q={q} tags={tags} onApply={updateParams} />
        <div className="flex items-center gap-1 text-sm">
          <label htmlFor="ticket-sort" className="text-neutral-500">
            並び替え:
          </label>
          <select
            id="ticket-sort"
            className="border rounded-sm px-1 py-0.5"
            value={sort.key}
            onChange={(e) => updateSort({ ...sort, key: e.target.value })}
          >
            <option value="updated">updated</option>
            <option value="id">id</option>
            {sortGroups.map((group) => (
              <option key={group} value={group}>
                {group.replace(/[@#]$/, '')}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="border rounded-sm px-2 py-0.5 hover:bg-neutral-100"
            onClick={() => updateSort({ ...sort, desc: !sort.desc })}
          >
            {sort.desc ? '↓ 降順' : '↑ 昇順'}
          </button>
        </div>
      </div>

      <div className="hidden sm:flex text-neutral-500 border-b">
        <div className="flex-none w-16 py-1 pl-4">id</div>
        <div className="w-2/4 py-1">title</div>
        <div className="flex-1 py-1">tags</div>
        <div className="flex-none w-40 py-1 pr-4">updated</div>
      </div>
      {tickets == null && !error && <p className="text-neutral-500 p-4">読み込み中...</p>}
      {tickets != null &&
        sortTickets(tickets, sort).map((ticket) => (
          <TicketRow key={ticket.id} ticket={ticket} catalog={catalog} />
        ))}
      {tickets != null && tickets.length === 0 && (
        <div className="text-neutral-500 p-4">
          {hasFilter ? (
            <>
              条件に一致するチケットがありません
              <button
                type="button"
                className="text-blue-700 hover:underline ml-2"
                onClick={() => updateParams('', [])}
              >
                条件をクリア
              </button>
            </>
          ) : (
            <>
              チケットがありません
              <Link to="/tickets/new" className="text-blue-700 hover:underline ml-2">
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
