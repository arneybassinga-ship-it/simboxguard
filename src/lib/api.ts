export const API_BASE_URL =
  import.meta.env.VITE_API_URL?.replace(/\/+$/, '') || 'http://localhost:4000';

export const apiUrl = (path: string) =>
  `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

export const apiFetch = async (input: string, init: RequestInit = {}): Promise<Response> => {
  const res = await fetch(apiUrl(input), {
    ...init,
    credentials: 'include',
    headers: { ...(init.headers || {}) },
  });
  if (res.status === 401 || res.status === 403) {
    const data = await res.clone().json().catch(() => ({}));
    if (data?.error?.includes('Accès refusé') || data?.error?.includes('token') || res.status === 401) {
      sessionStorage.removeItem('currentUser');
      window.location.href = '/';
    }
  }
  return res;
};
