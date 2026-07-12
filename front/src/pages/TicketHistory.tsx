import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, Ticket, TicketHistory as TicketHistoryEntry } from '../api/client';
import ConfirmDialog from '../components/ConfirmDialog';
import DiffView from '../components/DiffView';
import { formatDateTime } from '../lib/date';
import { diffLines, hasDiff } from '../lib/diff';
import { staleGuard } from '../lib/staleGuard';
import { currentUser } from '../lib/tags';

// チケットの履歴一覧。比較元・比較先の版を選んで差分を表示し、選択した版の内容へ戻せる
function TicketHistory() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [histories, setHistories] = useState<TicketHistoryEntry[]>([]);
  // 昇順のhistoriesへのインデックス（版番号 - 1）
  const [oldIdx, setOldIdx] = useState(0);
  const [newIdx, setNewIdx] = useState(0);
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState(false);
  // 「この版に戻す」の確認対象（版番号は表示用）
  const [confirming, setConfirming] = useState<{ history: TicketHistoryEntry; version: number } | null>(null);

  useEffect(() => {
    if (!id) return;
    // idが変わったら前のチケットの表示を消し、遅れて届いた古いレスポンスは捨てる
    // 表示のリセットが目的のため、ここでのsetStateは意図したもの
    /* eslint-disable react-hooks/set-state-in-effect */
    setTicket(null);
    setHistories([]);
    setError('');
    /* eslint-enable react-hooks/set-state-in-effect */
    const { fresh, cancel } = staleGuard();
    api.getTicket(id).then(fresh(setTicket)).catch(fresh((e: Error) => setError(e.message)));
    api
      .listTicketHistories(id)
      .then(
        fresh((list: TicketHistoryEntry[]) => {
          setHistories(list);
          // 初期表示は最新版とその1つ前の比較
          setNewIdx(list.length - 1);
          setOldIdx(Math.max(0, list.length - 2));
        }),
      )
      .catch(fresh((e: Error) => setError(e.message)));
    return cancel;
  }, [id]);

  const restore = async (history: TicketHistoryEntry) => {
    if (!id || restoring) return;
    setRestoring(true);
    try {
      await api.updateTicket(id, {
        title: history.title,
        content: history.content,
        tags: history.tags,
        updated_by: currentUser(),
      });
      navigate(`/tickets/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setRestoring(false);
    }
  };

  if (error && !ticket) return <p className="text-red-600 dark:text-red-400">{error}</p>;
  if (!ticket || histories.length === 0) return <p className="text-neutral-500 dark:text-neutral-400">読み込み中...</p>;

  const oldHistory = histories[oldIdx];
  const newHistory = histories[newIdx];
  const sections = [
    { label: 'タイトル', lines: diffLines(oldHistory.title, newHistory.title) },
    { label: 'タグ', lines: diffLines(oldHistory.tags, newHistory.tags) },
    { label: '本文', lines: diffLines(oldHistory.content, newHistory.content) },
  ].filter((s) => hasDiff(s.lines));

  return (
    <>
      <div className="flex items-start mb-4">
        <h2 className="text-xl flex-1">
          <span className="text-neutral-400 mr-2">#{ticket.id}</span>
          {ticket.title} の履歴
        </h2>
        <Link to={`/tickets/${ticket.id}`} className="border rounded-sm px-3 py-1 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800">
          詳細へ戻る
        </Link>
      </div>

      {error && <p className="text-red-600 dark:text-red-400 mb-2">{error}</p>}

      {histories.length === 1 ? (
        <p className="text-neutral-500 dark:text-neutral-400">変更履歴はまだありません</p>
      ) : (
        <>
      <div className="mb-6">
        <div className="hidden sm:flex text-sm text-neutral-500 dark:text-neutral-400 border-b py-1 gap-x-2">
          <span className="w-8 text-center">旧</span>
          <span className="w-8 text-center">新</span>
          <span className="w-24">版</span>
          <span className="w-36">日時</span>
          <span className="flex-1">更新者</span>
          <span className="w-24" />
        </div>
        {histories
          .map((history, idx) => ({ history, idx }))
          .reverse()
          .map(({ history, idx }) => (
            <div key={history.id} className="flex flex-wrap items-center border-b py-2 gap-x-2">
              <span className="w-8 text-center">
                <input
                  type="radio"
                  name="old-version"
                  aria-label={`v${idx + 1} を比較元にする`}
                  checked={oldIdx === idx}
                  onChange={() => setOldIdx(idx)}
                />
              </span>
              <span className="w-8 text-center">
                <input
                  type="radio"
                  name="new-version"
                  aria-label={`v${idx + 1} を比較先にする`}
                  checked={newIdx === idx}
                  onChange={() => setNewIdx(idx)}
                />
              </span>
              <span className="w-24">
                v{idx + 1}
                {idx === histories.length - 1 && <span className="text-sm text-neutral-500 dark:text-neutral-400">（最新）</span>}
              </span>
              <span className="w-36 text-sm text-neutral-500 dark:text-neutral-400">{formatDateTime(history.created_at)}</span>
              <span className="flex-1 text-sm text-neutral-500 dark:text-neutral-400" title={history.created_sub || undefined}>
                {history.created_by}
              </span>
              <span className="w-24 text-right">
                {idx < histories.length - 1 && (
                  <button
                    type="button"
                    className="text-blue-700 dark:text-blue-400 hover:underline text-sm disabled:opacity-50"
                    disabled={restoring}
                    onClick={() => setConfirming({ history, version: idx + 1 })}
                  >
                    この版に戻す
                  </button>
                )}
              </span>
            </div>
          ))}
      </div>

      <h3 className="text-lg mb-2">
        差分（v{oldIdx + 1} → v{newIdx + 1}）
      </h3>
      {sections.length === 0 && <p className="text-neutral-500 dark:text-neutral-400">選択した版の間に差分はありません</p>}
      {sections.map((section) => (
        <div key={section.label} className="mb-4">
          <div className="text-sm text-neutral-500 dark:text-neutral-400 mb-1">{section.label}</div>
          <DiffView lines={section.lines} />
        </div>
      ))}
        </>
      )}
      {confirming && (
        <ConfirmDialog
          title="チケットを過去の版に戻す"
          message={`v${confirming.version} の内容に戻しますか？（新しい版として保存されます）`}
          actionLabel="戻す"
          onConfirm={() => {
            const { history } = confirming;
            setConfirming(null);
            restore(history);
          }}
          onClose={() => setConfirming(null)}
        />
      )}
    </>
  );
}

export default TicketHistory;
