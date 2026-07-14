import { ReactNode, useRef, useState } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';
import { t } from '../i18n';

// タグ入力欄（TagInput）の未確定テキストが残ったまま保存すると失われるため、
// 保存前に確認ダイアログを挟むフック。onTextChangeをTagInputへ渡し、保存処理の先頭で
// guard(save) を呼ぶ。未確定テキストがあれば確認ダイアログを開いてtrueを返す
// （「このまま保存」でsaveが実行される）ので、呼び出し側は保存を中断する
export function usePendingTagGuard(): {
  onTextChange: (text: string) => void;
  guard: (save: () => void) => boolean;
  dialog: ReactNode;
} {
  // 保存時にしか参照しないため、キーストロークごとの再レンダーを避けてrefへ保持する
  const textRef = useRef('');
  const [confirming, setConfirming] = useState<{ text: string; save: () => void } | null>(null);

  const guard = (save: () => void): boolean => {
    const text = textRef.current.trim();
    if (!text) return false;
    setConfirming({ text, save });
    return true;
  };

  const dialog = confirming && (
    <ConfirmDialog
      title={t('pendingTagGuard.title')}
      message={t('pendingTagGuard.message', { text: confirming.text })}
      actionLabel={t('pendingTagGuard.saveAnyway')}
      onConfirm={() => {
        setConfirming(null);
        confirming.save();
      }}
      onClose={() => setConfirming(null)}
    />
  );

  return {
    onTextChange: (text: string) => {
      textRef.current = text;
    },
    guard,
    dialog,
  };
}
