import {
  ChangeEvent,
  ComponentPropsWithoutRef,
  KeyboardEvent as ReactKeyboardEvent,
  SyntheticEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { api, Ticket } from '../api/client';
import { staleGuard } from '../lib/staleGuard';

type Props = Omit<ComponentPropsWithoutRef<'textarea'>, 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
};

// 候補ポップアップに出すチケットの最大件数
const LIMIT = 7;
// ポップアップの幅（w-80）。右端からのはみ出し防止の計算に使う
const POPUP_WIDTH = 320;

// 補完中の参照。startは "#" の位置、queryは "#" からキャレットまでの検索語
type PendingRef = { start: number; query: string };

// キャレット位置計算用のミラー要素へ引き継ぐスタイル（折り返し位置を一致させる）
const MIRROR_STYLES = [
  'box-sizing',
  'width',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'letter-spacing',
  'line-height',
  'tab-size',
  'text-indent',
];

// textarea内の文字位置indexの直下（次の行の高さ）の座標を、textareaの左上を基準に求める。
// 同じ書式のミラー要素へキャレット以前のテキストを流し込み、マーカーspanの位置を測る定石の方法
function caretPopupPosition(el: HTMLTextAreaElement, index: number): { left: number; top: number } {
  const style = getComputedStyle(el);
  const mirror = document.createElement('div');
  for (const prop of MIRROR_STYLES) {
    mirror.style.setProperty(prop, style.getPropertyValue(prop));
  }
  mirror.style.position = 'absolute';
  mirror.style.top = '0';
  mirror.style.left = '0';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.textContent = el.value.slice(0, index);
  const marker = document.createElement('span');
  // 後続テキストも流し込み、マーカー位置の折り返しをtextareaと一致させる
  marker.textContent = el.value.slice(index) || '.';
  mirror.appendChild(marker);
  (el.parentElement ?? document.body).appendChild(mirror);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
  const left = Math.max(0, Math.min(marker.offsetLeft - el.scrollLeft, el.clientWidth - POPUP_WIDTH));
  const top = marker.offsetTop + lineHeight - el.scrollTop;
  mirror.remove();
  return { left, top };
}

// チケット参照の補完付きtextarea（本文・コメントの編集用）
// "#" を入力するとキャレット直下にチケット候補のポップアップを出し、後続の入力で
// インクリメンタル検索する。↑↓で選択、Enter/Tabで "#123 " 形式を挿入、Escで閉じる。マウス選択も可
function TicketRefTextarea({ value, onChange, onKeyDown, onSelect, onBlur, onScroll, ...rest }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [pending, setPending] = useState<PendingRef | null>(null);
  // Escで閉じた "#" の位置。同じ位置では再入力があるまでポップアップを出さない
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<Ticket[] | null>(null); // nullは検索中
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  const close = () => {
    setPending(null);
    setCandidates(null);
    setActive(0);
  };

  // キャレット直前の "#検索語" を検出して補完状態を更新する。
  // 単語の途中の "#"（issue#12 等）では発動しないよう、直前が英数字の場合は対象外
  const detect = (el: HTMLTextAreaElement) => {
    const caret = el.selectionStart;
    const m =
      caret === el.selectionEnd
        ? el.value.slice(0, caret).match(/(?:^|[^0-9A-Za-z_#])#([^\s#]*)$/)
        : null;
    if (!m) {
      if (pending) close();
      if (dismissed != null) setDismissed(null);
      return;
    }
    const start = caret - m[1].length - 1;
    if (dismissed === start) return;
    if (dismissed != null) setDismissed(null);
    if (pending?.start !== start) {
      setPos(caretPopupPosition(el, start));
    }
    if (pending?.start !== start || pending.query !== m[1]) {
      setPending({ start, query: m[1] });
    }
  };

  // 検索語の変化でインクリメンタル検索（少し待ってから既存の検索APIを引く）。
  // 数字だけの入力はID直指定とみなし、該当チケットを先頭に出す
  const query = pending?.query ?? null;
  useEffect(() => {
    if (query == null) return;
    const { fresh, cancel } = staleGuard();
    const apply = fresh((list: Ticket[]) => {
      setCandidates(list.slice(0, LIMIT));
      setActive(0);
    });
    const timer = setTimeout(() => {
      const exact = /^\d+$/.test(query) ? api.getTicket(query).catch(() => null) : Promise.resolve(null);
      Promise.all([exact, api.listTickets(query, [], LIMIT)])
        .then(([byId, list]) => {
          const rest = byId ? list.filter((t) => t.id !== byId.id) : list;
          apply(byId ? [byId, ...rest] : rest);
        })
        .catch(() => apply([]));
    }, 150);
    return () => {
      clearTimeout(timer);
      cancel();
    };
  }, [query]);

  const insert = (ticket: Ticket) => {
    const el = ref.current;
    if (!el || pending == null) return;
    const inserted = `#${ticket.id} `;
    const caretAfter = pending.start + inserted.length;
    onChange(el.value.slice(0, pending.start) + inserted + el.value.slice(el.selectionStart));
    close();
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caretAfter, caretAfter);
    });
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(e);
    if (pending == null || e.nativeEvent.isComposing) return;
    const list = candidates ?? [];
    if (e.key === 'Escape') {
      // ダイアログ内でもポップアップだけを閉じる（dialogのEsc閉じと画面のキーハンドラを止める）
      e.preventDefault();
      e.stopPropagation();
      setDismissed(pending.start);
      close();
    } else if (list.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      setActive((i) => (e.key === 'ArrowDown' ? Math.min(i + 1, list.length - 1) : Math.max(i - 1, 0)));
    } else if (list.length > 0 && (e.key === 'Enter' || e.key === 'Tab')) {
      e.preventDefault();
      insert(list[active] ?? list[0]);
    }
  };

  return (
    <span className="relative block">
      <textarea
        {...rest}
        ref={ref}
        value={value}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
          onChange(e.target.value);
          detect(e.target);
        }}
        onKeyDown={handleKeyDown}
        // クリックや矢印キーでのキャレット移動にも追従する（onSelectはキャレット移動でも発火する）
        onSelect={(e: SyntheticEvent<HTMLTextAreaElement>) => {
          onSelect?.(e);
          detect(e.currentTarget);
        }}
        onScroll={(e) => {
          onScroll?.(e);
          if (pending) setPos(caretPopupPosition(e.currentTarget, pending.start));
        }}
        onBlur={(e) => {
          onBlur?.(e);
          close();
        }}
      />
      {pending != null && (
        <span
          className="absolute z-10 block w-80 max-w-full bg-white dark:bg-neutral-800 border rounded-sm shadow-md max-h-64 overflow-auto"
          style={{ left: pos.left, top: pos.top }}
          // クリックやスクロールバー操作でtextareaのフォーカスを奪わない（blurで閉じない）
          onMouseDown={(e) => e.preventDefault()}
        >
          {candidates == null ? (
            <span className="block px-2 py-1 text-sm text-neutral-500 dark:text-neutral-400">検索中...</span>
          ) : candidates.length === 0 ? (
            <span className="block px-2 py-1 text-sm text-neutral-500 dark:text-neutral-400">該当するチケットはありません</span>
          ) : (
            <span className="block" role="listbox" aria-label="チケット参照の候補">
              {candidates.map((ticket, i) => (
                <button
                  key={ticket.id}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  className={`block w-full text-left px-2 py-1 text-sm truncate ${
                    i === active ? 'bg-blue-100 dark:bg-blue-900' : ''
                  } hover:bg-neutral-100 dark:hover:bg-neutral-700`}
                  onClick={() => insert(ticket)}
                  onMouseEnter={() => setActive(i)}
                >
                  <span className="text-neutral-400 mr-1">#{ticket.id}</span>
                  {ticket.title}
                </button>
              ))}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

export default TicketRefTextarea;
