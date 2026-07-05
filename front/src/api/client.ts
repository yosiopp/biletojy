export type Ticket = {
  id: number;
  title: string;
  content: string;
  tags: string;
  created_by: string;
  created_sub: string;
  updated_by: string;
  updated_sub: string;
  created_at: string;
  updated_at: string;
};

export type Comment = {
  id: number;
  ticket_id: number;
  content: string;
  created_by: string;
  created_sub: string;
  updated_by: string;
  updated_sub: string;
  created_at: string;
  updated_at: string;
};

// チケットの版（作成・編集時点の内容）。created_by/created_subはその版を作成した人
export type TicketHistory = {
  id: number;
  ticket_id: number;
  title: string;
  content: string;
  tags: string;
  created_by: string;
  created_sub: string;
  created_at: string;
};

// コメントの版（作成・編集時点の内容）。created_by/created_subはその版を作成した人
export type CommentHistory = {
  id: number;
  comment_id: number;
  content: string;
  created_by: string;
  created_sub: string;
  created_at: string;
};

// エクスポート/インポートで受け渡すチケット（コメント込み）
export type TicketExport = Ticket & { comments: Comment[] };

// 添付ファイル（画像を含む）。バイナリ本体は配信API（/api/files/{id}）で返る
export type AttachedFile = {
  id: number;
  name: string;
  mime: string;
  created_at: string;
};

// チケット作成時に適用するタイトル・本文・タグの雛形
export type Template = {
  id: number;
  name: string;
  title: string;
  content: string;
  tags: string;
  created_at: string;
  updated_at: string;
};

export type Tag = {
  id: number;
  tag: string;
  note: string | null;
  color: string | null;
  is_group: boolean;
  is_range: boolean;
  sort_order: number;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json();
}

export const api = {
  listTickets: (q: string, tags: string[]) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (tags.length > 0) params.set('tags', tags.join(','));
    const qs = params.toString();
    return request<Ticket[]>(`/api/tickets${qs ? `?${qs}` : ''}`);
  },
  getTicket: (id: number | string) => request<Ticket>(`/api/tickets/${id}`),
  createTicket: (data: Pick<Ticket, 'title' | 'content' | 'tags' | 'created_by'>) =>
    request<Ticket>('/api/tickets', { method: 'POST', body: JSON.stringify(data) }),
  updateTicket: (id: number | string, data: Pick<Ticket, 'title' | 'content' | 'tags' | 'updated_by'>) =>
    request<Ticket>(`/api/tickets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  listTicketHistories: (id: number | string) => request<TicketHistory[]>(`/api/tickets/${id}/histories`),
  listCommentHistories: (id: number) => request<CommentHistory[]>(`/api/comments/${id}/histories`),
  listBacklinks: (id: number | string) => request<Ticket[]>(`/api/tickets/${id}/backlinks`),
  listComments: (ticketId: number | string) => request<Comment[]>(`/api/tickets/${ticketId}/comments`),
  addComment: (ticketId: number | string, data: Pick<Comment, 'content' | 'created_by'>) =>
    request<Comment>(`/api/tickets/${ticketId}/comments`, { method: 'POST', body: JSON.stringify(data) }),
  updateComment: (id: number, data: Pick<Comment, 'content' | 'updated_by'>) =>
    request<Comment>(`/api/comments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  // エクスポートのダウンロードURL。検索条件（q + tags）で絞り込める（インポートにはjson形式を使う）
  exportUrl: (q: string, tags: string[], format: 'json' | 'markdown') => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (tags.length > 0) params.set('tags', tags.join(','));
    params.set('format', format);
    return `/api/export?${params.toString()}`;
  },
  // エクスポートしたJSONデータのインポート。チケット・コメントは新規IDで登録される
  importTickets: (tickets: TicketExport[]) =>
    request<{ imported: number }>('/api/import', { method: 'POST', body: JSON.stringify({ tickets }) }),
  uploadFile: (file: File) =>
    request<AttachedFile>(`/api/files?name=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    }),
  fileUrl: (id: number) => `/api/files/${id}`,
  listTemplates: () => request<Template[]>('/api/templates'),
  createTemplate: (data: Pick<Template, 'name' | 'title' | 'content' | 'tags'>) =>
    request<Template>('/api/templates', { method: 'POST', body: JSON.stringify(data) }),
  updateTemplate: (id: number, data: Pick<Template, 'name' | 'title' | 'content' | 'tags'>) =>
    request<Template>(`/api/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTemplate: (id: number) => request<void>(`/api/templates/${id}`, { method: 'DELETE' }),
  listTags: () => request<Tag[]>('/api/tags'),
  createTag: (data: Pick<Tag, 'tag' | 'note' | 'color'>) =>
    request<Tag>('/api/tags', { method: 'POST', body: JSON.stringify(data) }),
  updateTag: (id: number, data: Pick<Tag, 'tag' | 'note' | 'color'>) =>
    request<Tag>(`/api/tags/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  // タグ名の変更。使用している全チケットのタグも一括で書き換わる（updated_byはチケットの更新者として記録される）
  renameTag: (id: number, data: Pick<Tag, 'tag' | 'note' | 'color'> & { updated_by: string }) =>
    request<Tag>(`/api/tags/${id}/rename`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTag: (id: number) => request<void>(`/api/tags/${id}`, { method: 'DELETE' }),
  reorderTags: (ids: number[]) =>
    request<void>('/api/tags/order', { method: 'PUT', body: JSON.stringify({ ids }) }),
};
