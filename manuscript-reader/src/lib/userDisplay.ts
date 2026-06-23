/** Derive a 2-letter avatar monogram and a display name from a sign-in email.
 *  Shared by the library/hub AppShell rail and the reader rail. */
export function getInitials(email: string): string {
  const [local] = email.split('@');
  const parts = local.split(/[._+-]/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return local.slice(0, 2).toUpperCase();
}

export function getDisplayName(email: string): string {
  const [local] = email.split('@');
  return local.replace(/[._+-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
