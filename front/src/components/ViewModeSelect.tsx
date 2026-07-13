import { useMemo, useRef, useState } from 'react';
import { Tag } from '../api/client';
import { groupCatalog, hierarchyOptions } from '../lib/tags';
import { useMenuKeys } from '../lib/useMenuKeys';
import { useOutsideClick } from '../lib/useOutsideClick';
import { ViewMode } from '../lib/viewMode';

type Props = {
  mode: ViewMode;
  // 表示対象（ツリーのルート階層タグ / ボードの基準タググループ）。空文字は未指定
  by: string;
  catalog: Tag[];
  onChange: (mode: ViewMode, by: string) => void;
};

// 対象を持つモード（ツリー / ボード）は、モードボタンに ▾ を付けて対象選択のプルダウンを内蔵する。
// これによりモード切替と対象選択の関連が視覚的に分かる（対象セレクトを別置きしない）
type MenuMode = 'tree' | 'board';

// 対象の空選択（value=''）の表示名。ツリーは全件表示、ボードは未グルーピング
const EMPTY_LABEL: Record<MenuMode, string> = { tree: 'すべて', board: 'なし' };

// チケット一覧の表示モード切替（リスト / ツリー▾ / ボード▾）。
// ツリー・ボードは ▾ で対象選択のプルダウンを開く。キーボード操作（↑↓移動・Enter確定・Escで閉じる）に対応
function ViewModeSelect({ mode, by, catalog, onChange }: Props) {
  const [openMode, setOpenMode] = useState<MenuMode | null>(null);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const treeBtnRef = useRef<HTMLButtonElement>(null);
  const boardBtnRef = useRef<HTMLButtonElement>(null);

  useOutsideClick(rootRef, openMode ? () => setOpenMode(null) : undefined);

  // 対象の選択肢（先頭は空選択）。URL直指定でカタログに無い値が来ても表示が崩れないよう現在値を含める
  const treeOptions = useMemo(() => {
    const opts = ['', ...hierarchyOptions(catalog)];
    if (mode === 'tree' && by && !opts.includes(by)) opts.push(by);
    return opts;
  }, [catalog, by, mode]);
  const boardOptions = useMemo(() => {
    const opts = ['', ...[...groupCatalog(catalog).keys()].filter((g) => !/[@#]$/.test(g))];
    if (mode === 'board' && by && !opts.includes(by)) opts.push(by);
    return opts;
  }, [catalog, by, mode]);
  const optionsOf = (target: MenuMode) => (target === 'tree' ? treeOptions : boardOptions);

  // 対象を持つモードのプルダウンを開く（必要ならそのモードへ切替）。現在の対象へハイライトを合わせる
  const openMenuFor = (target: MenuMode) => {
    if (mode !== target) onChange(target, '');
    const opts = optionsOf(target);
    const curBy = mode === target ? by : '';
    setActive(Math.max(opts.indexOf(curBy), 0));
    setOpenMode(target);
  };

  const closeMenu = () => {
    setOpenMode(null);
    setActive(-1);
  };

  const toggleMenu = (target: MenuMode) => {
    if (openMode === target) closeMenu();
    else openMenuFor(target);
  };

  // ラベル部分のクリック: プルダウンは開かずモードだけ切り替える（対象は▾で選ぶ）。
  // 別モードからの切替時は対象をリセットする（リストへの切替と同じ流儀）
  const selectMode = (target: ViewMode) => {
    onChange(target, target !== 'list' && mode === target ? by : '');
    closeMenu();
  };

  const selectOption = (target: MenuMode, value: string) => {
    onChange(target, value);
    closeMenu();
  };

  const treeKeys = useMenuKeys({
    open: openMode === 'tree',
    buttonRef: treeBtnRef,
    count: treeOptions.length,
    setActive,
    onOpen: () => openMenuFor('tree'),
    onClose: closeMenu,
    onActivate: () => {
      if (active >= 0 && active < treeOptions.length) selectOption('tree', treeOptions[active]);
    },
  });
  const boardKeys = useMenuKeys({
    open: openMode === 'board',
    buttonRef: boardBtnRef,
    count: boardOptions.length,
    setActive,
    onOpen: () => openMenuFor('board'),
    onClose: closeMenu,
    onActivate: () => {
      if (active >= 0 && active < boardOptions.length) selectOption('board', boardOptions[active]);
    },
  });

  const btnClass = (target: ViewMode, extra: string) =>
    `px-2 py-0.5 ${extra} ${
      mode === target ? 'bg-neutral-200 dark:bg-neutral-600' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
    }`;

  // ▾（対象選択トリガー）部分。ラベルと同じセグメント内に置くため border-l は付けない
  const caretClass = (target: MenuMode) =>
    `px-1 py-0.5 ${target === 'board' ? 'rounded-r-sm' : ''} ${
      openMode === target || mode === target
        ? 'bg-neutral-200 dark:bg-neutral-600'
        : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
    }`;

  // 対象選択プルダウン本体
  const renderMenu = (target: MenuMode) => {
    const options = optionsOf(target);
    const curBy = mode === target ? by : '';
    return (
      <div
        role="listbox"
        aria-label="対象"
        className="absolute z-10 left-0 top-full mt-1 bg-white dark:bg-neutral-800 border rounded-sm shadow-md min-w-full max-h-64 overflow-auto whitespace-nowrap text-neutral-900 dark:text-neutral-100"
      >
        {options.map((opt, i) => (
          <button
            key={opt || '__empty__'}
            type="button"
            role="option"
            aria-selected={curBy === opt}
            className={`flex items-center w-full text-left px-2 py-1 ${
              i === active ? 'bg-blue-100 dark:bg-blue-900' : curBy === opt ? 'bg-blue-50 dark:bg-blue-950' : ''
            } hover:bg-neutral-100 dark:hover:bg-neutral-700`}
            onMouseEnter={() => setActive(i)}
            onClick={() => selectOption(target, opt)}
          >
            <span className="inline-block w-4 text-blue-700 dark:text-blue-400">{curBy === opt ? '✓' : ''}</span>
            {opt || EMPTY_LABEL[target]}
          </button>
        ))}
      </div>
    );
  };

  return (
    <div ref={rootRef} className="inline-flex border rounded-sm text-sm mr-2 mb-1" role="group" aria-label="表示モード">
      <button
        type="button"
        aria-pressed={mode === 'list'}
        className={btnClass('list', 'rounded-l-sm')}
        onClick={() => {
          closeMenu();
          onChange('list', '');
        }}
      >
        リスト
      </button>

      <span className="relative inline-flex" onKeyDown={treeKeys.onKeyDown}>
        {/* ラベル=モード切替のみ、▾=対象プルダウン、で別々のクリック領域にする */}
        <button type="button" aria-pressed={mode === 'tree'} className={btnClass('tree', 'border-l')} onClick={() => selectMode('tree')}>
          ツリー
        </button>
        <button
          ref={treeBtnRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={openMode === 'tree'}
          aria-label="ツリーの対象を選択"
          className={caretClass('tree')}
          onClick={() => toggleMenu('tree')}
        >
          <span aria-hidden="true" className="text-xs text-neutral-400">▾</span>
        </button>
        {openMode === 'tree' && renderMenu('tree')}
      </span>

      <span className="relative inline-flex" onKeyDown={boardKeys.onKeyDown}>
        <button type="button" aria-pressed={mode === 'board'} className={btnClass('board', 'border-l')} onClick={() => selectMode('board')}>
          ボード
        </button>
        <button
          ref={boardBtnRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={openMode === 'board'}
          aria-label="ボードの対象を選択"
          className={caretClass('board')}
          onClick={() => toggleMenu('board')}
        >
          <span aria-hidden="true" className="text-xs text-neutral-400">▾</span>
        </button>
        {openMode === 'board' && renderMenu('board')}
      </span>
    </div>
  );
}

export default ViewModeSelect;
