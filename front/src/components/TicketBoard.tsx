import { DragEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, Tag, Ticket } from '../api/client';
import { currentUser, groupCatalog, joinTags, parseTag, splitTags, tagColor, TagColorMap } from '../lib/tags';
import { invalidateCatalog } from '../lib/useCatalog';
import TagItem from './TagItem';

// カードのドラッグを示す独自MIMEタイプ。テキスト選択など無関係なドラッグを
// ドロップとして受け付けない（数字のテキストをドロップしてもチケットを動かさない）ための目印
const CARD_DRAG_TYPE = 'application/x-biletojy-ticket';

type Props = {
  // ソート済みの絞り込み結果（各列内はこの順で並ぶ）
  tickets: Ticket[];
  catalog: Tag[];
  colors: TagColorMap;
  // 列の基準にするタググループ（例: "status"）
  by: string;
  // カード移動でタグを付け替えたチケットの反映
  onUpdated: (ticket: Ticket) => void;
  onError: (message: string) => void;
};

type Column = {
  // 列が表すタグ（"status:OPEN"）。「なし」列はnull
  tag: string | null;
  label: string;
  tickets: Ticket[];
};

// タググループの値ごとの列にチケットカードを並べるボード。
// カードのドラッグ&ドロップ、またはカードにフォーカスして ←→ で列間を移動でき、
// 移動するとグループのタグを付け替えて保存する（グループタグは排他なので旧値を外して新値を付ける）。
// ↑↓は同じ列内のカード間のフォーカス移動、Enterでチケット詳細を開く
function TicketBoard({ tickets, catalog, colors, by, onUpdated, onError }: Props) {
  // ドロップ先としてハイライト中の列（tag ?? '' をキーにする）
  const [dropCol, setDropCol] = useState<string | null>(null);
  // カードをドラッグ中か（空の「なし」列をドロップ先として一時的に表示するために使う）
  const [dragging, setDragging] = useState(false);
  const cardRefs = useRef(new Map<number, HTMLAnchorElement>());
  // キーボードで列間移動したカードへ、再描画後にフォーカスを戻す
  const pendingFocus = useRef<number | null>(null);

  useEffect(() => {
    if (pendingFocus.current != null) {
      cardRefs.current.get(pendingFocus.current)?.focus();
      pendingFocus.current = null;
    }
  });

  // 列はカタログのグループ値（カタログ順）+「なし」。カタログに無い値を持つチケットも
  // 隠さないよう、見つかった値の列を末尾（「なし」の前）に補う
  const columns = useMemo<Column[]>(() => {
    const values = groupCatalog(catalog).get(by) ?? [];
    const cols: Column[] = values.map((t) => ({ tag: t.tag, label: parseTag(t.tag).name, tickets: [] }));
    const extra: Column[] = [];
    const none: Column = { tag: null, label: 'なし', tickets: [] };
    const prefix = `${by}:`;
    for (const ticket of tickets) {
      const value = splitTags(ticket.tags).find((t) => t.startsWith(prefix));
      if (!value) {
        none.tickets.push(ticket);
        continue;
      }
      let col = cols.find((c) => c.tag === value) ?? extra.find((c) => c.tag === value);
      if (!col) {
        col = { tag: value, label: parseTag(value).name, tickets: [] };
        extra.push(col);
      }
      col.tickets.push(ticket);
    }
    return [...cols, ...extra, none];
  }, [tickets, catalog, by]);

  // グループのタグを付け替えて保存する。元のタグがあった位置に新しい値を入れ、他のタグの並びは保つ
  const move = (ticket: Ticket, targetTag: string | null) => {
    const prefix = `${by}:`;
    let replaced = false;
    const next: string[] = [];
    for (const tag of splitTags(ticket.tags)) {
      if (!tag.startsWith(prefix)) {
        next.push(tag);
      } else if (targetTag != null && !replaced) {
        next.push(targetTag);
        replaced = true;
      }
      // 2つ目以降の同グループタグと、「なし」列への移動（targetTag == null）は取り除くだけ
    }
    if (targetTag != null && !replaced) next.push(targetTag);
    const nextTags = joinTags(next);
    if (nextTags === ticket.tags) return;
    api
      .updateTicket(ticket.id, {
        title: ticket.title,
        content: ticket.content,
        tags: nextTags,
        updated_by: currentUser(),
      })
      .then((updated) => {
        // カタログ外の値の列へ移すと未定義タグがサーバー側で自動登録されるため、共有キャッシュを取得し直させる
        invalidateCatalog();
        onUpdated(updated);
      })
      .catch((e: Error) => onError(e.message));
  };

  const onCardKeyDown = (e: ReactKeyboardEvent, ticket: Ticket, colIndex: number, rowIndex: number) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const target = colIndex + (e.key === 'ArrowLeft' ? -1 : 1);
      if (target < 0 || target >= columns.length) return;
      pendingFocus.current = ticket.id;
      move(ticket, columns[target].tag);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = columns[colIndex].tickets[rowIndex + (e.key === 'ArrowDown' ? 1 : -1)];
      if (next) cardRefs.current.get(next.id)?.focus();
    }
  };

  const onDrop = (e: DragEvent, column: Column) => {
    if (!e.dataTransfer.types.includes(CARD_DRAG_TYPE)) return;
    e.preventDefault();
    setDropCol(null);
    const id = Number(e.dataTransfer.getData(CARD_DRAG_TYPE));
    const ticket = tickets.find((t) => t.id === id);
    if (ticket) move(ticket, column.tag);
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:overflow-x-auto pb-2">
      {columns.map((column, colIndex) => {
        const key = column.tag ?? '';
        // 「なし」列は空かつ非ドラッグ時は隠す（ドラッグ中のみドロップ先として表示）
        if (column.tag === null && column.tickets.length === 0 && !dragging) return null;
        return (
          <div
            key={key}
            className={`sm:w-64 sm:flex-none border rounded-sm ${
              dropCol === key ? 'bg-blue-50 dark:bg-blue-950' : ''
            }`}
            onDragOver={(e) => {
              // カードのドラッグ以外（テキスト選択など）はドロップ先として反応しない
              if (!e.dataTransfer.types.includes(CARD_DRAG_TYPE)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setDropCol(key);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropCol(null);
            }}
            onDrop={(e) => onDrop(e, column)}
          >
            <div className="px-2 py-1 border-b text-sm text-neutral-500 dark:text-neutral-400">
              {column.label}
              <span className="ml-2">{column.tickets.length}</span>
            </div>
            <div className="p-2 flex flex-col gap-2 min-h-16">
              {column.tickets.map((ticket, rowIndex) => {
                // 列の基準になっているグループのタグはカードに重複表示しない
                const otherTags = splitTags(ticket.tags).filter((t) => !t.startsWith(`${by}:`));
                return (
                  <Link
                    key={ticket.id}
                    ref={(el) => {
                      if (el) cardRefs.current.set(ticket.id, el);
                      else cardRefs.current.delete(ticket.id);
                    }}
                    to={`/tickets/${ticket.id}`}
                    draggable
                    className="block border rounded-sm p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    onDragStart={(e) => {
                      e.dataTransfer.setData(CARD_DRAG_TYPE, String(ticket.id));
                      e.dataTransfer.effectAllowed = 'move';
                      setDragging(true);
                    }}
                    onDragEnd={() => {
                      setDragging(false);
                      setDropCol(null);
                    }}
                    onKeyDown={(e) => onCardKeyDown(e, ticket, colIndex, rowIndex)}
                  >
                    <span className="text-sm text-neutral-500 dark:text-neutral-400 mr-2">#{ticket.id}</span>
                    {ticket.title}
                    {otherTags.length > 0 && (
                      <span className="block mt-1 -mb-1">
                        {otherTags.map((tag) => (
                          <TagItem key={tag} tag={tag} color={tagColor(colors, tag)} />
                        ))}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default TicketBoard;
