import { KeyboardEvent as ReactKeyboardEvent, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Ticket } from '../api/client';
import { t } from '../i18n';
import { parseTag, splitTags, tagColor, TagColorMap } from '../lib/tags';
import TagItem from './TagItem';

type Props = {
  // ソート済みの絞り込み結果（ノード内のチケットはこの順で並ぶ）
  tickets: Ticket[];
  colors: TagColorMap;
  // ルートの階層タグ（例: "docs"。'' は全階層タグが対象）
  by: string;
};

type TreeNode = {
  path: string;
  label: string;
  children: TreeNode[];
  tickets: Ticket[];
  // サブツリー内のチケットID（件数表示用。複数パスを持つチケットの重複は除く）
  ids: Set<number>;
};

// 開閉状態のキーに使う「未分類」ノードのパス。実在の階層タグと衝突しない値にする
const UNCLASSIFIED = '\0unclassified';

type BuildNode = {
  path: string;
  label: string;
  children: Map<string, BuildNode>;
  tickets: Ticket[];
};

function finalize(node: BuildNode): TreeNode {
  const children = [...node.children.values()]
    .map(finalize)
    .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  const ids = new Set(node.tickets.map((t) => t.id));
  for (const child of children) {
    for (const id of child.ids) ids.add(id);
  }
  return { path: node.path, label: node.label, children, tickets: node.tickets, ids };
}

// 絞り込み結果のチケットが持つ階層タグからツリーを構築する（中間階層はプレフィックス展開で補う）。
// 複数の階層タグを持つチケットは各パスの下にそれぞれ現れる。
// 表示対象の階層タグを持たないチケットは末尾の「未分類」ノードにまとめ、一覧と同じ件数が見えるようにする
function buildTree(tickets: Ticket[], by: string): TreeNode[] {
  const root: BuildNode = { path: '', label: '', children: new Map(), tickets: [] };
  const unclassified: Ticket[] = [];
  for (const ticket of tickets) {
    const paths = splitTags(ticket.tags).filter(
      (tag) => parseTag(tag).isHierarchy && (by === '' || tag === by || tag.startsWith(`${by}/`)),
    );
    if (paths.length === 0) {
      unclassified.push(ticket);
      continue;
    }
    for (const path of paths) {
      let node = root;
      const parts = path.split('/');
      for (let i = 0; i < parts.length; i++) {
        const childPath = parts.slice(0, i + 1).join('/');
        let child = node.children.get(childPath);
        if (!child) {
          child = { path: childPath, label: parts[i], children: new Map(), tickets: [] };
          node.children.set(childPath, child);
        }
        node = child;
      }
      node.tickets.push(ticket);
    }
  }
  const nodes = finalize(root).children;
  if (unclassified.length > 0) {
    nodes.push({
      path: UNCLASSIFIED,
      label: t('ticketTree.unclassified'),
      children: [],
      tickets: unclassified,
      ids: new Set(unclassified.map((t) => t.id)),
    });
  }
  return nodes;
}

type Row =
  | { key: string; type: 'node'; node: TreeNode; depth: number; expanded: boolean }
  // path はこのチケットが属するノードの階層タグ（グルーピングに使った分は行のチップから省く）
  | { key: string; type: 'ticket'; ticket: Ticket; depth: number; path: string };

function flatten(nodes: TreeNode[], collapsed: Set<string>, depth: number, rows: Row[]) {
  for (const node of nodes) {
    const expanded = !collapsed.has(node.path);
    rows.push({ key: `n:${node.path}`, type: 'node', node, depth, expanded });
    if (!expanded) continue;
    for (const ticket of node.tickets) {
      rows.push({ key: `t:${node.path}:${ticket.id}`, type: 'ticket', ticket, depth: depth + 1, path: node.path });
    }
    flatten(node.children, collapsed, depth + 1, rows);
  }
}

// 深さに応じたインデント（Tailwindのクラスでは動的な深さを表せないためインライン指定）
function indent(depth: number) {
  return { paddingLeft: `${depth * 1.25 + 0.5}rem` };
}

// 階層タグのパス構造でチケットを入れ子表示するツリー。
// キーボード: ↑↓で行移動、→で展開（展開済みなら中へ）、←で折りたたみ（折りたたみ済みなら親へ）、
// Enterでノードの開閉・チケットの表示
function TicketTree({ tickets, colors, by }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [focusIndex, setFocusIndex] = useState(0);
  const rowRefs = useRef<(HTMLElement | null)[]>([]);

  const nodes = useMemo(() => buildTree(tickets, by), [tickets, by]);
  const rows = useMemo(() => {
    const rows: Row[] = [];
    flatten(nodes, collapsed, 0, rows);
    return rows;
  }, [nodes, collapsed]);

  // 折りたたみや再検索で行数が減ってもフォーカス位置が範囲内に収まるようにする
  const focus = Math.min(focusIndex, rows.length - 1);

  const toggle = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const moveFocus = (index: number) => {
    const next = Math.max(0, Math.min(index, rows.length - 1));
    setFocusIndex(next);
    rowRefs.current[next]?.focus();
  };

  const onRowKeyDown = (e: ReactKeyboardEvent, index: number, row: Row) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveFocus(index + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveFocus(index - 1);
    } else if (e.key === 'ArrowRight') {
      if (row.type !== 'node') return;
      e.preventDefault();
      const hasContent = row.node.children.length > 0 || row.node.tickets.length > 0;
      if (!row.expanded) toggle(row.node.path);
      else if (hasContent) moveFocus(index + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const hasContent = row.type === 'node' && (row.node.children.length > 0 || row.node.tickets.length > 0);
      if (row.type === 'node' && row.expanded && hasContent) {
        toggle(row.node.path);
        return;
      }
      // 折りたたみ済みノード・チケットでは親ノードへ移動する
      for (let i = index - 1; i >= 0; i--) {
        if (rows[i].type === 'node' && rows[i].depth < row.depth) {
          moveFocus(i);
          return;
        }
      }
    }
  };

  return (
    <div role="tree" aria-label={t('ticketTree.label')}>
      {rows.map((row, i) =>
        row.type === 'node' ? (
          <button
            key={row.key}
            ref={(el) => {
              rowRefs.current[i] = el;
            }}
            type="button"
            role="treeitem"
            aria-expanded={row.expanded}
            aria-level={row.depth + 1}
            tabIndex={i === focus ? 0 : -1}
            className="flex items-center w-full text-left border-b py-2 pr-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            style={indent(row.depth)}
            onClick={() => toggle(row.node.path)}
            onFocus={() => setFocusIndex(i)}
            onKeyDown={(e) => onRowKeyDown(e, i, row)}
          >
            <span className="w-4 flex-none text-xs text-neutral-400">{row.expanded ? '▾' : '▸'}</span>
            {row.node.label}
            <span className="ml-2 text-sm text-neutral-500 dark:text-neutral-400">{row.node.ids.size}</span>
          </button>
        ) : (
          <Link
            key={row.key}
            ref={(el) => {
              rowRefs.current[i] = el;
            }}
            to={`/tickets/${row.ticket.id}`}
            role="treeitem"
            aria-level={row.depth + 1}
            tabIndex={i === focus ? 0 : -1}
            className="block sm:flex sm:items-center border-b py-2 pr-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            style={indent(row.depth)}
            onFocus={() => setFocusIndex(i)}
            onKeyDown={(e) => onRowKeyDown(e, i, row)}
          >
            <span className="text-neutral-500 dark:text-neutral-400 mr-2">#{row.ticket.id}</span>
            {row.ticket.title}
            <span className="flex sm:inline-flex flex-wrap gap-1 sm:ml-2 mt-1 sm:mt-0">
              {splitTags(row.ticket.tags)
                .filter((tag) => tag !== row.path)
                .map((tag) => (
                  <TagItem key={tag} tag={tag} color={tagColor(colors, tag)} />
                ))}
            </span>
          </Link>
        ),
      )}
    </div>
  );
}

export default TicketTree;
