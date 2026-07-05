export type Ticket = {
  id: number;
  title: string;
  content: string;
  tags: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type Comment = {
  id: number;
  ticket_id: number;
  content: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type Image = {
  id: number;
  mime: string;
  created_at: string;
};

export type Tag = {
  id: number;
  tag: string;
  note: string | null;
  color: string | null;
  is_group: boolean;
  is_range: boolean;
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
  updateTicket: (id: number | string, data: Pick<Ticket, 'title' | 'content' | 'tags'>) =>
    request<Ticket>(`/api/tickets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  listBacklinks: (id: number | string) => request<Ticket[]>(`/api/tickets/${id}/backlinks`),
  listComments: (ticketId: number | string) => request<Comment[]>(`/api/tickets/${ticketId}/comments`),
  addComment: (ticketId: number | string, data: Pick<Comment, 'content' | 'created_by'>) =>
    request<Comment>(`/api/tickets/${ticketId}/comments`, { method: 'POST', body: JSON.stringify(data) }),
  updateComment: (id: number, data: Pick<Comment, 'content'>) =>
    request<Comment>(`/api/comments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  uploadImage: (file: File) =>
    request<Image>('/api/images', {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file,
    }),
  imageUrl: (id: number) => `/api/images/${id}`,
  listTags: () => request<Tag[]>('/api/tags'),
  createTag: (data: Pick<Tag, 'tag' | 'note' | 'color'>) =>
    request<Tag>('/api/tags', { method: 'POST', body: JSON.stringify(data) }),
  updateTag: (id: number, data: Pick<Tag, 'tag' | 'note' | 'color'>) =>
    request<Tag>(`/api/tags/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTag: (id: number) => request<void>(`/api/tags/${id}`, { method: 'DELETE' }),
};
