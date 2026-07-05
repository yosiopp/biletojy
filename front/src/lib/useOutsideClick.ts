import { RefObject, useEffect } from 'react';

// 要素の外側をクリック（mousedown）したらonCloseを呼ぶ。onCloseがundefinedの間は監視しない
export function useOutsideClick(ref: RefObject<HTMLElement | null>, onClose?: () => void) {
  useEffect(() => {
    if (!onClose) return;
    const onOutside = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [ref, onClose]);
}
