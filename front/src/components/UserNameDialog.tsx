import { FormEvent, useEffect, useState } from 'react';
import { hasCurrentUser, setCurrentUser } from '../lib/tags';

// ユーザ名（localStorageのbiletojy.user）が未設定の場合に、初回アクセス時へ設定を促すダイアログ。
// 閉じるだけなら未設定のままとなり、次回アクセス時に再度表示される
function UserNameDialog() {
  const [open, setOpen] = useState(() => !hasCurrentUser());
  const [name, setName] = useState('');

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  if (!open) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCurrentUser(name.trim());
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-20 bg-black/30 flex items-center justify-center"
      onClick={() => setOpen(false)}
    >
      <form
        role="dialog"
        aria-label="ユーザ名の設定"
        className="bg-white rounded-sm shadow-lg p-4 w-80"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="flex items-center mb-2">
          <h2 className="text-lg flex-1">ユーザ名の設定</h2>
          <button
            type="button"
            className="text-neutral-400 hover:text-neutral-700"
            aria-label="閉じる"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
        </div>
        <p className="text-sm text-neutral-500 mb-2">
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
            className="border rounded-sm px-4 py-1 hover:bg-neutral-100"
            onClick={() => setOpen(false)}
          >
            あとで
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
