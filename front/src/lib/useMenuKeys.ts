import { Dispatch, KeyboardEvent as ReactKeyboardEvent, RefObject, SetStateAction } from 'react';

type Options = {
  open: boolean;
  // トリガーボタン。キー操作はこのボタンにフォーカスがあるときだけ受け付け、閉じたら戻す
  buttonRef: RefObject<HTMLButtonElement | null>;
  // メニュー項目数（↑↓の移動範囲）
  count: number;
  setActive: Dispatch<SetStateAction<number>>;
  // 閉じた状態で↑↓が押されたときに開く（activeの初期化は呼び出し側で行う）
  onOpen: () => void;
  // Escなどで閉じる（activeのリセットは呼び出し側で行う。フォーカスの復帰はHookが行う）
  onClose: () => void;
  // Enter/Spaceでハイライト中の項目を実行する
  onActivate: () => void;
  // Delete/Backspaceでハイライト中の項目を削除する（不要なら省略）
  onDelete?: () => void;
};

// プルダウンメニュー共通のキーボード操作（↑↓で移動、Enter/Spaceで実行、Escで閉じてトリガーへフォーカスを戻す）。
// ルート要素のonKeyDownへ渡すハンドラと、フォーカス復帰込みで閉じるcloseを返す
export function useMenuKeys({ open, buttonRef, count, setActive, onOpen, onClose, onActivate, onDelete }: Options) {
  const close = () => {
    onClose();
    buttonRef.current?.focus();
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') {
      if (open) {
        e.stopPropagation();
        close();
      }
      return;
    }
    // メニュー内の入力欄などにフォーカスがあるときはリスト操作しない
    if (e.target !== buttonRef.current) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        onOpen();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, count - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onActivate();
    } else if (onDelete && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      onDelete();
    }
  };

  return { onKeyDown, close };
}
