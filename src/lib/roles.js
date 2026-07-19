export function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase();
  if (['admin', 'pharmabiz', 'operator', 'ops'].includes(role)) return 'admin';
  if (['brand', 'marque', 'vendor'].includes(role)) return 'brand';
  if (['provider', 'prestataire'].includes(role)) return 'provider';
  if (['intervenant', 'animator', 'animateur', 'trainer', 'formateur'].includes(role)) return 'intervenant';
  return 'agent';
}

export function resolveRole({ animator, profile, session }) {
  const metadataRole = session?.user?.app_metadata?.role || session?.user?.user_metadata?.role;
  const profileRole = profile?.role || profile?.user_role || profile?.profile_type || profile?.type;
  if (profileRole || metadataRole) return normalizeRole(profileRole || metadataRole);
  if (animator?.id) return 'intervenant';
  return 'agent';
}
