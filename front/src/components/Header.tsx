import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { currentUser, hasCurrentUser, USER_CHANGED_EVENT } from '../lib/tags';
import { loadThemeMode, setThemeMode, ThemeMode } from '../lib/theme';
import { useMenuKeys } from '../lib/useMenuKeys';
import { useOutsideClick } from '../lib/useOutsideClick';

const NAV_ITEMS = [
  { to: '/tickets', label: 'tickets' },
  { to: '/tags', label: 'tags' },
  { to: '/templates', label: 'templates' },
  { to: '/files', label: 'files' },
];

const navClass = ({ isActive }: { isActive: boolean }) =>
  `mx-2 text-blue-700 dark:text-blue-400 hover:underline ${isActive ? 'underline' : ''}`;

// モバイル（sm未満）のグローバルナビ。ハンバーガーボタンで開くポップアップメニュー。
// ExportImport / ViewSelect と同型（↑↓移動・Enter実行・Escで閉じる・外側クリックで閉じる）。
// 開閉アイコンはアイコンボタン化タスクまでテキスト「≡」/「×」で仮置き。
function NavMenu() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  useOutsideClick(rootRef, open ? () => setOpen(false) : undefined);

  const { onKeyDown, close } = useMenuKeys({
    open,
    buttonRef,
    count: NAV_ITEMS.length,
    setActive,
    onOpen: () => setOpen(true),
    onClose: () => {
      setOpen(false);
      setActive(0);
    },
    onActivate: () => itemRefs.current[active]?.click(),
  });

  return (
    <span ref={rootRef} className="relative flex-1 sm:hidden" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="メニュー"
        className="border rounded-sm px-2 py-0.5 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        onClick={() => (open ? close() : setOpen(true))}
      >
        {open ? '×' : '≡'}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="ナビゲーション"
          className="absolute z-10 left-0 top-full mt-1 bg-white dark:bg-neutral-800 border rounded-sm shadow-md whitespace-nowrap"
        >
          {NAV_ITEMS.map((item, i) => (
            <NavLink
              key={item.to}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              role="menuitem"
              to={item.to}
              className={({ isActive }) =>
                `block px-3 py-1.5 text-sm ${i === active ? 'bg-blue-100 dark:bg-blue-900' : ''} ${
                  isActive ? 'text-blue-700 dark:text-blue-400' : ''
                } hover:bg-neutral-100 dark:hover:bg-neutral-700`
              }
              onMouseEnter={() => setActive(i)}
              onClick={() => {
                setOpen(false);
                setActive(0);
              }}
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      )}
    </span>
  );
}

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

        {/* デスクトップ（sm以上）は横並びナビ、モバイルはハンバーガーメニュー */}
        <nav className="hidden sm:block flex-1">
          <ul className="inline-flex">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink className={navClass} to={item.to}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <NavMenu />

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
          className="text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:underline max-w-32 truncate"
          title="ユーザ名を変更"
          onClick={onUserClick}
        >
          {user ?? 'ユーザ名を設定'}
        </button>
      </div>
    </header>
  );
}

export default Header;
