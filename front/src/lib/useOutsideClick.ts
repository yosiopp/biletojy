import { RefObject, useEffect, useRef } from 'react';

// 要素の外側の操作（mousedown、またはTab等によるフォーカス移動）でonCloseを呼ぶ。
// onCloseがundefinedの間は監視しない
export function useOutsideClick(ref: RefObject<HTMLElement | null>, onClose?: () => void) {
  // onCloseは毎レンダー新しいクロージャで渡されるため、refに保持して
  // documentリスナの付け外しは開閉の切り替わり時だけにする
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const enabled = onClose != null;
  useEffect(() => {
    if (!enabled) return;
    const onOutside = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onCloseRef.current?.();
    };
    document.addEventListener('mousedown', onOutside);
    // focusinはバブルするため、キーボード操作でフォーカスが外へ移った場合もここで閉じる
    document.addEventListener('focusin', onOutside);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('focusin', onOutside);
    };
  }, [ref, enabled]);
}
