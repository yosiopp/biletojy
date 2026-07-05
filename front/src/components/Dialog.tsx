import { MouseEvent, ReactNode, useEffect, useRef } from 'react';

// HTMLのdialog要素によるモーダル。マウントと同時にshowModalで開く。
// Escや背景クリックで閉じられるため、呼び出し側はonCloseで表示状態を破棄する
function Dialog({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  // 本体はp-4のdivで覆っているため、クリックのe.targetがdialog自体になるのは背景（backdrop）のみ
  const onClick = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === ref.current) ref.current?.close();
  };

  return (
    <dialog
      ref={ref}
      aria-label={label}
      className="m-auto bg-white rounded-sm shadow-lg backdrop:bg-black/30"
      onClose={onClose}
      onClick={onClick}
    >
      <div className="p-4">{children}</div>
    </dialog>
  );
}

export default Dialog;
