export const API_BASE_URL =
  import.meta.env.VITE_API_URL?.replace(/\/+$/, "") || "http://localhost:4000";

export const apiUrl = (path: string) =>
  `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

export const getToken = (): string | null => localStorage.getItem('authToken');
export const setToken = (token: string) => localStorage.setItem('authToken', token);
export const clearToken = () => localStorage.removeItem('authToken');

const getHeaders = (): Record<string, string> => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const apiFetch = async (input: string, init: RequestInit = {}): Promise<Response> => {
  const res = await fetch(apiUrl(input), {
    ...init,
    headers: {
      ...getHeaders(),
      ...(init.headers || {}),
    },
  });
  // Token expiré ou invalide → déconnexion automatique
  if (res.status === 403 || res.status === 401) {
    const data = await res.clone().json().catch(() => ({}));
    if (data?.error?.includes('Accès refusé') || data?.error?.includes('token')) {
      clearToken();
      localStorage.removeItem('currentUser');
      window.location.href = '/';
    }
  }
  return res;
};
