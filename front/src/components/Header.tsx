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

// 言語の選択肢。null は自動（ブラウザ設定に追随）。言語名は翻訳せずその言語のまま表示する
const LANG_OPTIONS: { value: Lang | null; label: string }[] = [
  { value: null, label: t('header.langAuto') },
  { value: 'ja', label: '日本語' },
  { value: 'en', label: 'English' },
];

const navClass = ({ isActive }: { isActive: boolean }) =>
  `mx-2 text-blue-700 dark:text-blue-400 hover:underline ${isActive ? 'underline' : ''}`;

// モバイル（sm未満）のグローバルナビ。右端のハンバーガーボタンで右側からのドロワーメニューを開く。
// ナビに加え、デスクトップではヘッダーへ直接置いている言語・表示テーマ・ユーザ名の切り替えもここに含める。
// キーボード操作は ExportImport / ViewSelect と同型（↑↓移動・Enter実行・Escで閉じる。オーバーレイのクリックでも閉じる）。
function NavDrawer({ user, onUserClick }: { user: string | null; onUserClick: () => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [theme, setTheme] = useState<ThemeMode>(loadThemeMode);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  const langSetting = loadLangSetting();

  // ↑↓で移動する項目の通し番号（ナビ → 言語 → テーマ → ユーザ名）
  const langBase = NAV_ITEMS.length;
  const themeBase = langBase + LANG_OPTIONS.length;
  const userIndex = themeBase + THEME_OPTIONS.length;

  const { onKeyDown, close } = useMenuKeys({
    open,
    buttonRef,
    count: userIndex + 1,
    setActive,
    onOpen: () => setOpen(true),
    onClose: () => {
      setOpen(false);
      setActive(0);
    },
    onActivate: () => itemRefs.current[active]?.click(),
  });

  const sectionClass = 'border-t mt-2 px-3 pt-2 pb-1 text-xs text-neutral-500 dark:text-neutral-400';
  const itemClass = (index: number, selected = false) =>
    `flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm ${index === active ? 'bg-blue-100 dark:bg-blue-900' : ''} ${
      selected ? 'text-blue-700 dark:text-blue-400' : ''
    } hover:bg-neutral-100 dark:hover:bg-neutral-700`;

  return (
    <span className="ml-auto sm:hidden" onKeyDown={onKeyDown}>
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
        <Icon name="menu" />
      </button>

      {open && (
        <div className="fixed inset-0 z-20 bg-black/30 dark:bg-black/60" onClick={close}>
          <div
            role="menu"
            aria-label={t('header.menu')}
            className="absolute inset-y-0 right-0 w-64 bg-white dark:bg-neutral-800 shadow-lg overflow-y-auto py-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-end px-2">
              <button
                type="button"
                className="p-2 -m-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                aria-label={t('common.close')}
                title={t('common.close')}
                onClick={close}
              >
                <Icon name="close" />
              </button>
            </div>

            {NAV_ITEMS.map((item, i) => (
              <NavLink
                key={item.to}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                role="menuitem"
                to={item.to}
                className={({ isActive }) => itemClass(i, isActive)}
                onMouseEnter={() => setActive(i)}
                onClick={close}
              >
                {item.label}
              </NavLink>
            ))}

            <div className={sectionClass}>{t('header.language')}</div>
            {LANG_OPTIONS.map((option, i) => (
              <button
                key={option.label}
                ref={(el) => {
                  itemRefs.current[langBase + i] = el;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={option.value === langSetting}
                className={itemClass(langBase + i, option.value === langSetting)}
                onMouseEnter={() => setActive(langBase + i)}
                onClick={() => setLangSetting(option.value)}
              >
                {option.label}
              </button>
            ))}

            <div className={sectionClass}>{t('header.theme')}</div>
            {THEME_OPTIONS.map((option, i) => (
              <button
                key={option.mode}
                ref={(el) => {
                  itemRefs.current[themeBase + i] = el;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={option.mode === theme}
                className={itemClass(themeBase + i, option.mode === theme)}
                onMouseEnter={() => setActive(themeBase + i)}
                onClick={() => {
                  setTheme(option.mode);
                  setThemeMode(option.mode);
                }}
              >
                <Icon name={option.icon} />
                {option.label}
              </button>
            ))}

            <div className={sectionClass}>{t('header.userName')}</div>
            <button
              ref={(el) => {
                itemRefs.current[userIndex] = el;
              }}
              type="button"
              role="menuitem"
              title={t('header.changeUserName')}
              className={itemClass(userIndex)}
              onMouseEnter={() => setActive(userIndex)}
              onClick={() => {
                close();
                onUserClick();
              }}
            >
              <span className="truncate">{user ?? t('header.setUserName')}</span>
            </button>
          </div>
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
    <span ref={rootRef} className="relative mr-3 hidden sm:inline-block" onKeyDown={onKeyDown}>
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
    <span ref={rootRef} className="relative mr-3 hidden sm:inline-block" onKeyDown={onKeyDown}>
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

        {/* デスクトップ（sm以上）は横並びナビ + 言語/テーマ/ユーザ名、モバイルは右端のハンバーガーボタンとドロワーに集約 */}
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

        <LangMenu />
        <ThemeMenu />

        <button
          type="button"
          className="hidden sm:block text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:underline max-w-32 truncate"
          title={t('header.changeUserName')}
          onClick={onUserClick}
        >
          {user ?? t('header.setUserName')}
        </button>

        <NavDrawer user={user} onUserClick={onUserClick} />
      </div>
    </header>
  );
}

export default Header;
