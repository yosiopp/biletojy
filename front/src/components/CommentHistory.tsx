import { useEffect, useState } from 'react';
import { api, Comment, CommentHistory as CommentHistoryEntry } from '../api/client';
import { t } from '../i18n';
import { formatDateTime } from '../lib/date';
import { diffLines } from '../lib/diff';
import { staleGuard } from '../lib/staleGuard';
import { currentUser } from '../lib/tags';
import ConfirmDialog from './ConfirmDialog';
import DiffView from './DiffView';

// コメントの履歴一覧。新しい版から順に、1つ前の版との差分で表示する
function CommentHistory({ comment, onRestored }: { comment: Comment; onRestored: (updated: Comment) => void }) {
  const [histories, setHistories] = useState<CommentHistoryEntry[] | null>(null);
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState(false);
  // 「この版に戻す」の確認対象（版番号は表示用）
  const [confirming, setConfirming] = useState<{ history: CommentHistoryEntry; version: number } | null>(null);

  useEffect(() => {
    const { fresh, cancel } = staleGuard();
    api.listCommentHistories(comment.id).then(fresh(setHistories)).catch(fresh((e: Error) => setError(e.message)));
    return cancel;
    // 復元でupdated_atが変わったら履歴を取得し直す
  }, [comment.id, comment.updated_at]);

  const restore = async (history: CommentHistoryEntry) => {
    if (restoring) return;
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
  if (!histories) return <p className="text-neutral-500 dark:text-neutral-400 mt-2">{t('common.loading')}</p>;

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
                {idx === histories.length - 1 && t('history.latest')} ・{' '}
                <span title={history.created_sub || undefined}>{history.created_by}</span> ・{' '}
                {formatDateTime(history.created_at)}
              </span>
              {idx < histories.length - 1 && (
                <button
                  type="button"
                  className="text-blue-700 dark:text-blue-400 hover:underline disabled:opacity-50"
                  disabled={restoring}
                  onClick={() => setConfirming({ history, version: idx + 1 })}
                >
                  {t('history.restoreThis')}
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
      {confirming && (
        <ConfirmDialog
          title={t('commentHistory.restoreTitle')}
          message={t('history.restoreMessage', { version: confirming.version })}
          actionLabel={t('history.restoreAction')}
          onConfirm={() => {
            const { history } = confirming;
            setConfirming(null);
            restore(history);
          }}
          onClose={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

export default CommentHistory;
