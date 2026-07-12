import type { Tag } from '../api/client';

// "status:OPEN" -> { group: "status", name: "OPEN" }
// "due-date@:2026-07-04" -> { group: "due-date@", name: "2026-07-04", isDate: true }
// "estimate#:3" -> { group: "estimate#", name: "3", isNumber: true }
// "docs/design/api" -> { group: null, name: "docs/design/api", isHierarchy: true }
export type ParsedTag = {
  raw: string;
  group: string | null;
  name: string;
  isDate: boolean;
  isNumber: boolean;
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
    isNumber: group != null && group.endsWith('#'),
    isHierarchy: group == null && name.includes('/'),
  };
}

// タグ絞り込み条件の1要素。先頭 "-" で除外（NOT）、"|" 区切りでOR
// （例: "-status:CLOSED", "status:OPEN|status:WIP"）。NOTはOR全体に掛かる
export type ParsedCond = {
  raw: string;
  not: boolean;
  alts: string[];
};

export function parseCond(raw: string): ParsedCond {
  const not = raw.startsWith('-');
  const body = not ? raw.slice(1) : raw;
  return { raw, not, alts: body.split('|').filter((a) => a.length > 0) };
}

export function buildCond(not: boolean, alts: string[]): string {
  if (alts.length === 0) return '';
  return (not ? '-' : '') + alts.join('|');
}

// 条件のすべての択が同じタググループに属する場合そのグループ名、それ以外はnull
export function condGroup(cond: string): string | null {
  const { alts } = parseCond(cond);
  if (alts.length === 0) return null;
  const groups = alts.map((a) => parseTag(a).group);
  return groups[0] != null && groups.every((g) => g === groups[0]) ? groups[0] : null;
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

// 日時・数値タグの範囲検索の比較演算子（back/data/rangecond.go の解釈と対応）
export const RANGE_OP_CHARS = ['>', '<', '='];
const RANGE_OPS = '>=|<=|>|<|=';
const NUMBER_RANGE_VALUE = new RegExp(`^(?:${RANGE_OPS})-?\\d+(?:\\.\\d+)?$`);
const DATE_RANGE_VALUE = new RegExp(`^(?:${RANGE_OPS})?\\d{4}-\\d{2}-\\d{2}(?:T\\d{2}:\\d{2})?$`);
const RANGE_OP_PREFIX = new RegExp(`^(?:${RANGE_OPS})?`);
// 値待ちの入力テキスト（"due-date@:" 等）。cond形は先頭の -（除外）と比較演算子付きも許す
const PENDING_RANGE = /^(.+[@#]):$/;
const PENDING_COND_RANGE = new RegExp(`^-?(.+[@#]):(?:${RANGE_OPS})?$`);

// "due-date@2026-07-01" のようなコロン抜けの日時・数値タグを "due-date@:2026-07-01" に補正する
// 誤補正を避けるため、既知の @/# グループか、値がそのタグの形式（比較演算子付き含む）のときのみ補正する
// 数値タグの値パターンは "issue#123" のような通常タグを巻き込みやすいため、演算子付きに限る
export function normalizeTag(input: string, groups: Iterable<string>): string {
  const m = input.match(/^([^:]+[@#])([^:].*)$/);
  if (!m) return input;
  const [, group, rest] = m;
  const valuePattern = group.endsWith('#') ? NUMBER_RANGE_VALUE : DATE_RANGE_VALUE;
  if (new Set(groups).has(group) || valuePattern.test(rest)) {
    return `${group}:${rest}`;
  }
  return input;
}

// 日時・数値タグの値 ">=2026-07-10" 等を比較演算子と値に分ける
export function splitRangeValue(name: string): [op: string, value: string] {
  const op = name.match(RANGE_OP_PREFIX)?.[0] ?? '';
  return [op, name.slice(op.length)];
}

// ピッカーで編集する値。比較演算子を除き、日時タグは時刻付きの値でも日付部分だけにする
export function rangePickerValue(group: string, name: string): string {
  const [, value] = splitRangeValue(name);
  return group.endsWith('@') ? value.slice(0, 10) : value;
}

// 入力テキスト全体が日時・数値タグの値待ち（例: "due-date@:"）ならそのグループ名を返す
// cond=trueはタグ検索条件向けで、先頭の -（除外）と比較演算子付き（例: "-due-date@:>="）も値待ちとして扱う
export function pendingRangeGroup(text: string, cond = false): string | null {
  const m = text.match(cond ? PENDING_COND_RANGE : PENDING_RANGE);
  return m ? m[1] : null;
}

// Tab補完の候補: 階層タグ（中間階層含む）と日時・数値の具体値を除くタグ全体に加え、
// `group:` 形も途中段階として補完できるようにする
export function completionCandidates(catalog: Tag[]): string[] {
  const options = new Set<string>(hierarchyOptions(catalog));
  for (const tag of catalog) {
    const { isDate, isNumber } = parseTag(tag.tag);
    if (!isDate && !isNumber) options.add(tag.tag);
  }
  for (const group of groupCatalog(catalog).keys()) {
    options.add(`${group}:`);
  }
  return [...options];
}

// 入力末尾のトークンを、前方一致するタグ候補の共通プレフィックスまで補完した入力全体を返す
// 候補が一意ならタグ全体まで、複数でも確定している部分（例: "sta" → "status:"）までは補完する
// 1文字も進まない場合はnull。トークンは空白・"|"（OR）区切りで、先頭の "-"（除外）は対象から外す
export function completeTag(input: string, candidates: Iterable<string>): string | null {
  const [tail] = input.match(/[^\s|]*$/) ?? [''];
  let head = input.slice(0, input.length - tail.length);
  let token = tail;
  if (head === '' && token.startsWith('-')) {
    head = '-';
    token = token.slice(1);
  }
  if (token.length === 0) return null;
  let common: string | null = null;
  for (const c of candidates) {
    if (!c.startsWith(token)) continue;
    if (common == null) {
      common = c;
      continue;
    }
    let i = 0;
    while (i < common.length && common[i] === c[i]) i++;
    common = common.slice(0, i);
  }
  return common != null && common.length > token.length ? `${head}${common}` : null;
}

// Tabキー押下時の補完。補完が起きたら補完後のテキストを返し、そうでなければnull（Tabは通常のフォーカス移動のまま）
// 値を差し替えても入力候補（datalist）のポップアップが残るため、フォーカスを入れ直して閉じる
export function completeOnTab(
  e: { key: string; shiftKey: boolean; preventDefault(): void; currentTarget: HTMLInputElement },
  text: string,
  candidates: Iterable<string>,
): string | null {
  if (e.key !== 'Tab' || e.shiftKey) return null;
  const completed = completeTag(text, candidates);
  if (completed == null) return null;
  e.preventDefault();
  e.currentTarget.blur();
  e.currentTarget.focus();
  return completed;
}

// 日時タグの期限状態。日付のみの場合はその日の終わりを期限とみなす
export function dueState(name: string): 'overdue' | 'soon' | null {
  const m = name.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/);
  if (!m) return null;
  const due = m[4] != null
    ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
    : new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59);
  const diff = due.getTime() - Date.now();
  if (diff < 0) return 'overdue';
  if (diff < 3 * 24 * 60 * 60 * 1000) return 'soon';
  return null;
}

// グループ内のタグをTagGroupSelectの選択肢に変換する
export function groupOptions(tags: Tag[]): { value: string; label: string; note: string | null }[] {
  return tags.map((t) => ({ value: t.tag, label: parseTag(t.tag).name, note: t.note }));
}

const USER_KEY = 'biletojy.user';

// setCurrentUserによる変更をマウント済みの画面（作成者入力欄など）へ知らせるイベント
export const USER_CHANGED_EVENT = 'biletojy:user-changed';

export function currentUser(): string {
  return localStorage.getItem(USER_KEY) || 'anonymous';
}

// ユーザ名が一度でも設定されたか（未設定なら初回アクセス時に設定ダイアログを出す）
export function hasCurrentUser(): boolean {
  return localStorage.getItem(USER_KEY) !== null;
}

export function setCurrentUser(name: string) {
  localStorage.setItem(USER_KEY, name);
  window.dispatchEvent(new Event(USER_CHANGED_EVENT));
}
