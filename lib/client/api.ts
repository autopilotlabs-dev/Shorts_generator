/** fetch wrapper: JSON in/out, throws Error(message) on non-2xx. */
export async function api<T = unknown>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...rest.headers } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Session expired: send the user to sign in (auth endpoints report their own errors).
    if (res.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/auth/")) window.location.href = "/login";
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}
