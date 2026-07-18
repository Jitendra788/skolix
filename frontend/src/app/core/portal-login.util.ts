/** Shared login error text for portal auth screens. */
export function portalLoginErrorMessage(err: unknown, roleLabel: string): string {
  const status = (err as { status?: number } | null)?.status;
  if (status === 0 || status == null) {
    return 'Cannot reach the API. On Vercel, set API_ORIGIN to your public backend URL and redeploy.';
  }
  if (status === 401 || status === 403) {
    return `Invalid ${roleLabel} credentials.`;
  }
  if (status >= 500) {
    return 'Server error. Please try again in a moment.';
  }
  return `Login failed (${status}). Check API_ORIGIN / backend.`;
}

export function isApiOriginConfigured(origin: string): boolean {
  const o = (origin || '').trim();
  if (!o) return false;
  if (o.includes('REPLACE_WITH_YOUR_API')) return false;
  return /^https?:\/\//i.test(o);
}
