import { CANONICAL_INSTITUTIONS, normalizeInstitutionToken, resolveInstitutionSources } from "./institution-alias";

export interface OwnerInstitution {
  id: string;
  name: string;
}

export function ownerMatchesInstitution(owner: string, institution: OwnerInstitution): boolean {
  if (normalizeInstitutionToken(owner) === normalizeInstitutionToken(institution.name)) return true;

  const resolved = resolveInstitutionSources(owner);
  if (resolved.slugs.length !== 1 || resolved.unresolved.length > 0 || resolved.allDiscos) return false;
  return CANONICAL_INSTITUTIONS[resolved.slugs[0]].id === institution.id;
}
