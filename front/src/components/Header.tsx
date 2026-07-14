import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Lang, loadLangSetting, setLangSetting, t } from '../i18n';
import { currentUser, hasCurrentUser, USER_CHANGED_EVENT } from '../lib/tags';
import { loadThemeMode, setThemeMode, ThemeMode } from '../lib/theme';
import { useMenuKeys } from '../lib/useMenuKeys';
import { useOutsideClick } from '../lib/useOutsideClick';
import Icon, { IconName } from './Icon';

const NAV_ITEMS = [
  { to: '/tickets', label: 'tickets' },
  { to: '/tags', label: 'tags' },
  { to: '/templates', label: 'templates' },
  { to: '/files', label: 'files' },
];

// 表示テーマの選択肢。現在値はボタンのアイコン（と title）で示す
const THEME_OPTIONS: { mode: ThemeMode; icon: IconName; label: string }[] = [
  { mode: 'system', icon: 'brightness_auto', label: t('header.themeAuto') },
  { mode: 'light', icon: 'light_mode', label: t('header.themeLight') },
  { mode: 'dark', icon: 'dark_mode', label: t('header.themeDark') },
];

const navClass = ({ isActive }: { isActive: boolean }) =>
  `mx-2 text-blue-700 dark:text-blue-400 hover:underline ${isActive ? 'underline' : ''}`;

// モバイル（sm未満）のグローバルナビ。ハンバーガーボタン（menu / close アイコン）で開くポップアップメニュー。
// ExportImport / ViewSelect と同型（↑↓移動・Enter実行・Escで閉じる・外側クリックで閉じる）。
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
        aria-label={t('header.menu')}
        title={t('header.menu')}
        className="inline-flex items-center justify-center border rounded-full p-1.5 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Icon name={open ? 'close' : 'menu'} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t('header.nav')}
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

// 表示テーマ切替。アイコンボタン + ポップアップメニュー（自動 / ライト / ダーク）。
// NavMenu と同型のキーボード操作（↑↓移動・Enter実行・Escで閉じる・外側クリックで閉じる）
function ThemeMenu() {
  const [theme, setTheme] = useState<ThemeMode>(loadThemeMode);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useOutsideClick(rootRef, open ? () => setOpen(false) : undefined);

  const current = THEME_OPTIONS.find((o) => o.mode === theme) ?? THEME_OPTIONS[0];

  // 開くときは現在のテーマにハイライトを合わせる
  const openMenu = () => {
    setActive(Math.max(THEME_OPTIONS.findIndex((o) => o.mode === theme), 0));
    setOpen(true);
  };

  const { onKeyDown, close } = useMenuKeys({
    open,
    buttonRef,
    count: THEME_OPTIONS.length,
    setActive,
    onOpen: openMenu,
    onClose: () => setOpen(false),
    onActivate: () => itemRefs.current[active]?.click(),
  });

  const choose = (mode: ThemeMode) => {
    setTheme(mode);
    setThemeMode(mode);
    close();
  };

  return (
    <span ref={rootRef} className="relative mr-3" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('header.theme')}
        title={t('header.themeTitle', { label: current.label })}
        className="inline-flex items-center justify-center border rounded-full p-1.5 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        onClick={() => (open ? close() : openMenu())}
      >
        <Icon name={current.icon} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t('header.theme')}
          className="absolute z-10 right-0 top-full mt-1 bg-white dark:bg-neutral-800 border rounded-sm shadow-md whitespace-nowrap"
        >
          {THEME_OPTIONS.map((option, i) => (
            <button
              key={option.mode}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={option.mode === theme}
              className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm ${
                i === active ? 'bg-blue-100 dark:bg-blue-900' : ''
              } ${
                option.mode === theme ? 'text-blue-700 dark:text-blue-400' : ''
              } hover:bg-neutral-100 dark:hover:bg-neutral-700`}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(option.mode)}
            >
              <Icon name={option.icon} />
              {option.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

// 言語の選択肢。null は自動（ブラウザ設定に追随）。言語名は翻訳せずその言語のまま表示する
const LANG_OPTIONS: { value: Lang | null; label: string }[] = [
  { value: null, label: t('header.langAuto') },
  { value: 'ja', label: '日本語' },
  { value: 'en', label: 'English' },
];

// 表示言語切替。ThemeMenu と同パターンのアイコンボタン + ポップアップメニュー。
// 選択すると localStorage へ保存してリロードし、全文言を切り替える（lib/theme.ts のテーマ切替と同じ流儀）
function LangMenu() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useOutsideClick(rootRef, open ? () => setOpen(false) : undefined);

  const setting = loadLangSetting();
  const current = LANG_OPTIONS.find((o) => o.value === setting) ?? LANG_OPTIONS[0];

  // 開くときは現在の設定にハイライトを合わせる
  const openMenu = () => {
    setActive(Math.max(LANG_OPTIONS.findIndex((o) => o.value === setting), 0));
    setOpen(true);
  };

  const { onKeyDown, close } = useMenuKeys({
    open,
    buttonRef,
    count: LANG_OPTIONS.length,
    setActive,
    onOpen: openMenu,
    onClose: () => setOpen(false),
    onActivate: () => itemRefs.current[active]?.click(),
  });

  return (
    <span ref={rootRef} className="relative mr-3" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('header.language')}
        title={t('header.languageTitle', { label: current.label })}
        className="inline-flex items-center justify-center border rounded-full p-1.5 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        onClick={() => (open ? close() : openMenu())}
      >
        <Icon name="language" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t('header.language')}
          className="absolute z-10 right-0 top-full mt-1 bg-white dark:bg-neutral-800 border rounded-sm shadow-md whitespace-nowrap"
        >
          {LANG_OPTIONS.map((option, i) => (
            <button
              key={option.label}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={option.value === setting}
              className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm ${
                i === active ? 'bg-blue-100 dark:bg-blue-900' : ''
              } ${
                option.value === setting ? 'text-blue-700 dark:text-blue-400' : ''
              } hover:bg-neutral-100 dark:hover:bg-neutral-700`}
              onMouseEnter={() => setActive(i)}
              onClick={() => setLangSetting(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

function Header({ onUserClick }: { onUserClick: () => void }) {
  // 現在のユーザ名（未設定ならnull）。設定ダイアログでの保存を即時反映する
  const [user, setUser] = useState<string | null>(() => (hasCurrentUser() ? currentUser() : null));

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

        <LangMenu />
        <ThemeMenu />

        <button
          type="button"
          className="text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:underline max-w-32 truncate"
          title={t('header.changeUserName')}
          onClick={onUserClick}
        >
          {user ?? t('header.setUserName')}
        </button>
      </div>
    </header>
  );
}

export default Header;
