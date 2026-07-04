import type { Tag } from '../api/client';

// "status:OPEN" -> { group: "status", name: "OPEN" }
// "due-date@:2026-07-04" -> { group: "due-date@", name: "2026-07-04", isDate: true }
// "docs/design/api" -> { group: null, name: "docs/design/api", isHierarchy: true }
export type ParsedTag = {
  raw: string;
  group: string | null;
  name: string;
  isDate: boolean;
  isHierarchy: boolean;
};

export function parseTag(raw: string): ParsedTag {
  const sep = raw.indexOf(':');
  const group = sep > 0 ? raw.slice(0, sep) : null;
  const name = sep > 0 ? raw.slice(sep + 1) : raw;
  return {
    raw,
    group,
    name,
    isDate: group != null && group.endsWith('@'),
    isHierarchy: group == null && name.includes('/'),
  };
}

export function splitTags(tags: string): string[] {
  return tags.split(/\s+/).filter((t) => t.length > 0);
}

export function joinTags(tags: string[]): string {
  return tags.join(' ');
}

// カタログからタグの表示色を引く（完全一致 → グループ一致の順）
export function tagColor(catalog: Tag[], raw: string): string | null {
  const exact = catalog.find((t) => t.tag === raw);
  if (exact?.color) return exact.color;
  const { group } = parseTag(raw);
  if (group) {
    const groupEntry = catalog.find((t) => t.tag === `${group}:`);
    if (groupEntry?.color) return groupEntry.color;
  }
  return null;
}

// カタログのグループタグを { グループ名: 選択肢[] } に整理する
// 値の無い "due-date@:" のようなエントリは選択肢が空のグループになる
export function groupCatalog(catalog: Tag[]): Map<string, Tag[]> {
  const groups = new Map<string, Tag[]>();
  for (const tag of catalog) {
    const { group, name } = parseTag(tag.tag);
    if (group == null) continue;
    const list = groups.get(group) ?? [];
    if (name.length > 0) list.push(tag);
    groups.set(group, list);
  }
  return groups;
}

// カタログの階層タグ（"/" 入り、グループ無し）を全プレフィックス込みで列挙する
// 例: "docs/design/api" -> ["docs", "docs/design", "docs/design/api"]
export function hierarchyOptions(catalog: Tag[]): string[] {
  const options = new Set<string>();
  for (const tag of catalog) {
    const parsed = parseTag(tag.tag);
    if (!parsed.isHierarchy) continue;
    const parts = parsed.name.split('/');
    for (let i = 1; i <= parts.length; i++) {
      options.add(parts.slice(0, i).join('/'));
    }
  }
  return [...options].sort();
}

// グループにも階層にも属さない通常タグ
export function plainTags(catalog: Tag[]): Tag[] {
  return catalog.filter((t) => {
    const parsed = parseTag(t.tag);
    return parsed.group == null && !parsed.isHierarchy;
  });
}

const USER_KEY = 'biletojy.user';

export function currentUser(): string {
  return localStorage.getItem(USER_KEY) || 'anonymous';
}

export function setCurrentUser(name: string) {
  localStorage.setItem(USER_KEY, name);
}
