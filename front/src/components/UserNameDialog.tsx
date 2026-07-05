import { FormEvent, useEffect, useState } from 'react';
import { currentUser, hasCurrentUser, setCurrentUser } from '../lib/tags';

// ユーザ名（localStorageのbiletojy.user）を設定するダイアログ。
// 未設定での初回アクセス時に自動表示されるほか、ヘッダーのユーザ名クリックでも開ける（Layout参照）。
// 保存せずに閉じた場合は未設定のままとなり、次回アクセス時に再度自動表示される
function UserNameDialog({ onClose }: { onClose: () => void }) {
  // 再設定の場合は現在の名前を初期値にする
  const [name, setName] = useState(() => (hasCurrentUser() ? currentUser() : ''));

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCurrentUser(name.trim());
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-20 bg-black/30 dark:bg-black/60 flex items-center justify-center"
      onClick={onClose}
    >
      <form
        role="dialog"
        aria-label="ユーザ名の設定"
        className="bg-white dark:bg-neutral-800 rounded-sm shadow-lg p-4 w-80"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="flex items-center mb-2">
          <h2 className="text-lg flex-1">ユーザ名の設定</h2>
          <button
            type="button"
            className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
            aria-label="閉じる"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-2">
          チケットやコメントの作成者名として記録されます。未設定のままの場合は anonymous
          として記録されます。
        </p>
        <input
          type="text"
          className="border rounded-sm px-2 py-1 w-full mb-3"
          placeholder="ユーザ名"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <div className="text-right">
          <button
            type="button"
            className="border rounded-sm px-4 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-700"
            onClick={onClose}
          >
            {hasCurrentUser() ? 'キャンセル' : 'あとで'}
          </button>
          <button
            type="submit"
            className="bg-blue-600 text-white rounded-sm px-4 py-1 ml-2 hover:bg-blue-700 disabled:opacity-50"
            disabled={!name.trim()}
          >
            保存
          </button>
        </div>
      </form>
    </div>
  );
}

export default UserNameDialog;
