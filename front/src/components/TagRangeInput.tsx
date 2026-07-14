import { RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { RANGE_OP_CHARS } from '../lib/tags';
import { useOutsideClick } from '../lib/useOutsideClick';

type Props = {
  group: string; // "due-date@" や "estimate#"（末尾で日付か数値かを判定）
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  submitLabel?: string;
  // 入力ボックスに取り付ける場合の基準要素と現在テキスト。キャレット位置の直下に表示する
  // 省略時（チップ編集など）は親要素の直下（left: 0）に表示する
  anchorRef?: RefObject<HTMLInputElement | null>;
  text?: string;
  // 表示と同時に値入力へフォーカスを移してピッカーを開くか。falseならフォーカスは入力ボックスに残し、
  // Tab等で値入力へフォーカスが移った時点でピッカーを開く（検索欄など、続けて比較演算子等を打ちたい場合。
  // 開いたピッカーがキー入力を吸うブラウザがあるため、フォーカスを残す間はピッカーも開かない）
  autoFocus?: boolean;
  // 入力ボックスのテキストを書き換える。値が空の状態でのBackspaceで末尾1文字を消して編集へ戻り、
  // operators指定時は比較演算子キー（> < =）を末尾へ追記する。省略時（チップ編集など）はどちらも無視
  onTextChange?: (next: string) => void;
  operators?: boolean;
  // Escapeキーと外側クリックで閉じる（チップ編集用）。省略時はEscapeでanchorへフォーカスを戻す
  onClose?: () => void;
};

// showPickerはユーザ操作起点でない場合などに例外を投げるため、失敗は黙って無視する（手動で開けばよい）
function openPicker(el: HTMLInputElement) {
  try {
    el.showPicker?.();
  } catch {
    // noop
  }
}

// テキスト幅の計測用に使い回すcanvasコンテキスト
const measureCtx = document.createElement('canvas').getContext('2d');

// 日時・数値タグの値入力ポップアップ
// 入力ボックスのタグ入力位置（キャレット直下）やチップの直下に重ねて表示する。
// Enterまたはボタンで確定する
function TagRangeInput({
  group,
  value,
  onValueChange,
  onSubmit,
  submitLabel = t('tagRangeInput.add'),
  anchorRef,
  text = '',
  autoFocus = true,
  onTextChange,
  operators = false,
  onClose,
}: Props) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [left, setLeft] = useState(0);
  const isNumber = group.endsWith('#');

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus(); // フォーカス時のonFocusでピッカーが開く
  }, [autoFocus]);

  useOutsideClick(rootRef, onClose);

  // 入力ボックスに取り付けた場合は、入力済みテキストの描画幅からキャレット位置を求めてその直下に表示する
  useLayoutEffect(() => {
    const anchor = anchorRef?.current;
    if (!anchor || !measureCtx) return;
    const style = getComputedStyle(anchor);
    measureCtx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const textWidth = measureCtx.measureText(text).width;
    const x = parseFloat(style.paddingLeft) + textWidth - anchor.scrollLeft;
    // 右端からはみ出さないようポップアップのおおよその幅ぶん手前で止める
    setLeft(Math.max(0, Math.min(x, anchor.clientWidth - 240)));
  }, [anchorRef, text]);

  return (
    <span
      ref={rootRef}
      className="absolute z-10 top-full mt-1 flex items-center gap-1 bg-white dark:bg-neutral-800 border rounded-sm shadow-md p-2"
      style={{ left }}
    >
      <input
        ref={inputRef}
        type={isNumber ? 'number' : 'date'}
        step={isNumber ? 'any' : undefined}
        className="border rounded-sm px-1 py-0.5"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onFocus={(e) => openPicker(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (value) onSubmit();
          } else if (onTextChange && operators && RANGE_OP_CHARS.includes(e.key) && !value) {
            e.preventDefault();
            onTextChange(text + e.key);
          } else if (onTextChange && e.key === 'Backspace' && !value) {
            e.preventDefault();
            onTextChange(text.slice(0, -1));
            anchorRef?.current?.focus();
          } else if (e.key === 'Escape') {
            // <dialog>内では既定動作（cancelでダイアログごと閉じる）を抑止し、ピッカーだけを閉じる
            e.preventDefault();
            e.stopPropagation();
            if (onClose) onClose();
            else anchorRef?.current?.focus();
          }
        }}
      />
      <button
        type="button"
        className="border rounded-sm px-2 py-0.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700"
        onClick={() => value && onSubmit()}
      >
        {submitLabel}
      </button>
    </span>
  );
}

export default TagRangeInput;
