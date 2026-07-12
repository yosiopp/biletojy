import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { hasCurrentUser } from '../lib/tags';
import Header from './Header';
import UserNameDialog from './UserNameDialog';

const SHORTCUTS: [string, string][] = [
  ['Ctrl+N', 'チケット作成'],
  ['Ctrl+Shift+N', 'タグ作成'],
  ['Ctrl+E', 'チケット編集（詳細表示中）'],
  ['Ctrl+H', 'チケット履歴（詳細表示中）'],
  ['Ctrl+L', 'チケット一覧へ移動'],
  ['Ctrl+Shift+L', 'ファイル一覧へ移動'],
  ['Ctrl+T', 'タグ一覧へ移動'],
  ['Ctrl+M', 'テンプレート一覧へ移動'],
  ['?', 'このヘルプを表示'],
];

// 入力欄にフォーカスがある間はショートカットを無効にする
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showHelp, setShowHelp] = useState(false);
  // ユーザ名が未設定の場合は初回アクセス時に設定ダイアログを自動表示する
  const [showUserDialog, setShowUserDialog] = useState(() => !hasCurrentUser());

  useEffect(() => {
    const eventListener = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.key === 'Escape') {
        setShowHelp(false);
        return;
      }
      if (event.key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        setShowHelp((v) => !v);
        event.preventDefault();
        return;
      }
      if (!event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'n' && event.shiftKey) {
        navigate('/tags?new=1');
      } else if (key === 'n') {
        navigate('/tickets/new');
      } else if (key === 'e') {
        const match = location.pathname.match(/^\/tickets\/(\d+)$/);
        if (!match) return;
        navigate(`/tickets/${match[1]}/edit`);
      } else if (key === 'h') {
        const match = location.pathname.match(/^\/tickets\/(\d+)$/);
        if (!match) return;
        navigate(`/tickets/${match[1]}/history`);
      } else if (key === 'l' && event.shiftKey) {
        navigate('/files');
      } else if (key === 'l') {
        navigate('/tickets');
      } else if (key === 't') {
        navigate('/tags');
      } else if (key === 'm') {
        navigate('/templates');
      } else {
        return;
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', eventListener);
    return () => window.removeEventListener('keydown', eventListener);
  }, [navigate, location]);

  return (
    <>
      <Header onUserClick={() => setShowUserDialog(true)} />
      <main className="p-2">
        <Outlet />
      </main>

      {showUserDialog && <UserNameDialog onClose={() => setShowUserDialog(false)} />}

      <button
        type="button"
        className="fixed bottom-4 right-4 z-20 w-8 h-8 rounded-full border bg-white dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 shadow-sm hover:bg-neutral-100 dark:hover:bg-neutral-700"
        title="ショートカット一覧（?）"
        aria-label="ショートカット一覧"
        onClick={() => setShowHelp((v) => !v)}
      >
        ?
      </button>

      {showHelp && (
        <div
          className="fixed inset-0 z-20 bg-black/30 dark:bg-black/60 flex items-center justify-center"
          onClick={() => setShowHelp(false)}
        >
          <div
            role="dialog"
            aria-label="キーボードショートカット"
            className="bg-white dark:bg-neutral-800 rounded-sm shadow-lg p-4 w-80"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center mb-2">
              <h2 className="text-lg flex-1">キーボードショートカット</h2>
              <button
                type="button"
                className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                aria-label="閉じる"
                onClick={() => setShowHelp(false)}
              >
                ×
              </button>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {SHORTCUTS.map(([key, desc]) => (
                  <tr key={key}>
                    <td className="py-1 pr-3 whitespace-nowrap">
                      <kbd className="border rounded-sm px-1.5 py-0.5 bg-neutral-50 dark:bg-neutral-700 font-mono text-xs">{key}</kbd>
                    </td>
                    <td className="py-1">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

export default Layout;
