export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string };
    throw new Error(err.error || '請求失敗');
  }
  return res.json() as Promise<T>;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string };
    throw new Error(err.error || '請求失敗');
  }
  return res.json() as Promise<T>;
}

function adminHeaders(secret: string, withBody = false): HeadersInit {
  return {
    ...(withBody ? { 'Content-Type': 'application/json' } : {}),
    'X-Admin-Secret': secret,
  };
}

export async function apiAdminGet<T>(path: string, secret: string): Promise<T> {
  const res = await fetch(path, { headers: adminHeaders(secret), credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string };
    throw new Error(err.error || '請求失敗');
  }
  return res.json() as Promise<T>;
}

export async function apiAdminPost<T>(path: string, body: unknown, secret: string): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: adminHeaders(secret, true),
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string };
    throw new Error(err.error || '請求失敗');
  }
  return res.json() as Promise<T>;
}

export async function apiAdminDelete(path: string, secret: string): Promise<void> {
  const res = await fetch(path, { method: 'DELETE', headers: adminHeaders(secret), credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string };
    throw new Error(err.error || '請求失敗');
  }
}

export async function apiAdminPatch<T>(path: string, body: unknown, secret: string): Promise<T> {
  const res = await fetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': secret },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string };
    throw new Error(err.error || '請求失敗');
  }
  return res.json() as Promise<T>;
}
