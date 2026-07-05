import { useEffect, useState } from 'react';
import { api, Comment, CommentHistory as CommentHistoryEntry } from '../api/client';
import { formatDateTime } from '../lib/date';
import { diffLines } from '../lib/diff';
import { staleGuard } from '../lib/staleGuard';
import { currentUser } from '../lib/tags';
import DiffView from './DiffView';

// コメントの履歴一覧。新しい版から順に、1つ前の版との差分で表示する
function CommentHistory({ comment, onRestored }: { comment: Comment; onRestored: (updated: Comment) => void }) {
  const [histories, setHistories] = useState<CommentHistoryEntry[] | null>(null);
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    const { fresh, cancel } = staleGuard();
    api.listCommentHistories(comment.id).then(fresh(setHistories)).catch(fresh((e: Error) => setError(e.message)));
    return cancel;
    // 復元でupdated_atが変わったら履歴を取得し直す
  }, [comment.id, comment.updated_at]);

  const restore = async (history: CommentHistoryEntry, version: number) => {
    if (restoring) return;
    if (!window.confirm(`v${version} の内容に戻しますか？（新しい版として保存されます）`)) return;
    setRestoring(true);
    try {
      const updated = await api.updateComment(comment.id, {
        content: history.content,
        updated_by: currentUser(),
      });
      onRestored(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRestoring(false);
    }
  };

  if (error) return <p className="text-red-600 dark:text-red-400 mt-2">{error}</p>;
  if (!histories) return <p className="text-neutral-500 dark:text-neutral-400 mt-2">読み込み中...</p>;

  return (
    <div className="mt-2">
      {histories
        .map((history, idx) => ({ history, idx }))
        .reverse()
        .map(({ history, idx }) => (
          <div key={history.id} className="border rounded-sm p-2 mb-2">
            <div className="flex items-center text-sm text-neutral-500 dark:text-neutral-400 mb-1">
              <span className="flex-1">
                v{idx + 1}
                {idx === histories.length - 1 && '（最新）'} ・{' '}
                <span title={history.created_sub || undefined}>{history.created_by}</span> ・{' '}
                {formatDateTime(history.created_at)}
              </span>
              {idx < histories.length - 1 && (
                <button
                  type="button"
                  className="text-blue-700 dark:text-blue-400 hover:underline disabled:opacity-50"
                  disabled={restoring}
                  onClick={() => restore(history, idx + 1)}
                >
                  この版に戻す
                </button>
              )}
            </div>
            {/* 最初の版は比較対象がないため内容をそのまま表示する */}
            <DiffView
              lines={
                idx > 0
                  ? diffLines(histories[idx - 1].content, history.content)
                  : history.content.split('\n').map((text) => ({ kind: 'same' as const, text }))
              }
            />
          </div>
        ))}
    </div>
  );
}

export default CommentHistory;
