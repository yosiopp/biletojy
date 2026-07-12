import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { currentUser, hasCurrentUser, USER_CHANGED_EVENT } from '../lib/tags';
import { loadThemeMode, setThemeMode, ThemeMode } from '../lib/theme';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `mx-2 text-blue-700 dark:text-blue-400 hover:underline ${isActive ? 'underline' : ''}`;

function Header({ onUserClick }: { onUserClick: () => void }) {
  // 現在のユーザ名（未設定ならnull）。設定ダイアログでの保存を即時反映する
  const [user, setUser] = useState<string | null>(() => (hasCurrentUser() ? currentUser() : null));
  // 表示テーマ（自動=OS設定追随 / ライト / ダーク）
  const [theme, setTheme] = useState<ThemeMode>(loadThemeMode);

  useEffect(() => {
    const handler = () => setUser(hasCurrentUser() ? currentUser() : null);
    window.addEventListener(USER_CHANGED_EVENT, handler);
    return () => window.removeEventListener(USER_CHANGED_EVENT, handler);
  }, []);

  return (
    <header>
      <div className="flex items-center py-1 border-b px-2">
        <h1 className="text-2xl inline mr-4">
          <Link to="/tickets">biletojy</Link>
        </h1>

        <nav className="inline flex-1">
          <ul className="inline-flex">
            <li>
              <NavLink className={navClass} to="/tickets">
                tickets
              </NavLink>
            </li>
            <li>
              <NavLink className={navClass} to="/tags">
                tags
              </NavLink>
            </li>
            <li>
              <NavLink className={navClass} to="/templates">
                templates
              </NavLink>
            </li>
          </ul>
        </nav>

        <select
          className="border rounded-sm px-1 py-0.5 text-sm text-neutral-500 dark:text-neutral-400 mr-3"
          aria-label="表示テーマ"
          title="表示テーマ（自動はOS設定に追随）"
          value={theme}
          onChange={(e) => {
            const mode = e.target.value as ThemeMode;
            setTheme(mode);
            setThemeMode(mode);
          }}
        >
          <option value="system">自動</option>
          <option value="light">ライト</option>
          <option value="dark">ダーク</option>
        </select>

        <button
          type="button"
          className="text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:underline mr-3 max-w-32 truncate"
          title="ユーザ名を変更"
          onClick={onUserClick}
        >
          {user ?? 'ユーザ名を設定'}
        </button>

        <Link
          to="/tickets/new"
          className="bg-blue-600 text-white rounded-sm px-3 py-1 text-sm hover:bg-blue-700 whitespace-nowrap"
          title="ctrl+n"
        >
          + 新規チケット
        </Link>
      </div>
    </header>
  );
}

export default Header;
