import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Ticket } from '../api/client';
import { isTypingTarget } from '../lib/keyboard';
import type { TagColorMap } from '../lib/tags';
import TicketRow from './TicketRow';

type Props = {
  // ソート済みの絞り込み結果（この順で並ぶ）
  tickets: Ticket[];
  colors: TagColorMap;
};

// リスト表示の行一覧（roving tabindex でフォーカス中の行だけ Tab 対象にする）。
// キーボード: ↑↓で行を移動（行の外で押しても前回の位置から一覧へ入る）、
// Spaceでフォーカス中のチケットを表示（EnterはLinkの既定動作で表示）
function TicketRows({ tickets, colors }: Props) {
  const navigate = useNavigate();
  const [focusIndex, setFocusIndex] = useState(0);
  const rowRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  // 再検索で行数が減ってもフォーカス位置が範囲内に収まるようにする
  const focus = Math.min(focusIndex, tickets.length - 1);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      // プルダウンメニューなど、↑↓やSpaceを自前で処理する要素から操作を奪わない
      if (event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (isTypingTarget(event.target)) return;
      // ヘルプなどのダイアログ表示中は背後の一覧を動かさない
      if (document.querySelector('[role="dialog"]')) return;
      const current = rowRefs.current.indexOf(document.activeElement as HTMLAnchorElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        const next = current < 0 ? focus : Math.max(0, Math.min(current + delta, tickets.length - 1));
        setFocusIndex(next);
        rowRefs.current[next]?.focus();
      } else if (event.key === ' ' && current >= 0) {
        // ボタンなど行以外にフォーカスがあるときはSpaceの既定動作に任せる
        event.preventDefault();
        navigate(`/tickets/${tickets[current].id}`);
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [tickets, focus, navigate]);

  return (
    <>
      {tickets.map((ticket, i) => (
        <TicketRow
          key={ticket.id}
          ref={(el) => {
            rowRefs.current[i] = el;
          }}
          ticket={ticket}
          colors={colors}
          tabIndex={i === focus ? 0 : -1}
          onFocus={() => setFocusIndex(i)}
        />
      ))}
    </>
  );
}

export default TicketRows;
