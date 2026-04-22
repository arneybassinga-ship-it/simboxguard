export const API_BASE_URL =
  import.meta.env.VITE_API_URL?.replace(/\/+$/, "") || "http://localhost:4000";

export const apiUrl = (path: string) =>
  `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
