export const API_BASE_URL =
  import.meta.env.VITE_API_URL?.replace(/\/+$/, "") || "http://localhost:4000";

export const apiUrl = (path: string) =>
  `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

const getUserHeaders = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem('currentUser');
    if (!raw) return {};
    const u = JSON.parse(raw);
    return {
      'X-User-Id':   u.id   || 'inconnu',
      'X-User-Nom':  u.nom  || 'inconnu',
      'X-User-Role': u.role || 'inconnu',
    };
  } catch {
    return {};
  }
};

export const apiFetch = (input: string, init: RequestInit = {}): Promise<Response> => {
  const userHeaders = getUserHeaders();
  return fetch(apiUrl(input), {
    ...init,
    headers: {
      ...userHeaders,
      ...(init.headers || {}),
    },
  });
};
