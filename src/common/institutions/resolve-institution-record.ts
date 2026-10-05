import { CANONICAL_INSTITUTIONS, resolveInstitutionSources } from "./institution-alias";

type InstitutionReader = {
  institution: {
    findFirst: (args: {
      where: { name: { equals: string; mode: "insensitive" } };
    }) => Promise<{ id: string } | null>;
    findUnique: (args: { where: { id: string } }) => Promise<{ id: string } | null>;
  };
};

export async function findInstitutionIdForSourceText(
  client: InstitutionReader,
  sourceText: string,
): Promise<string | null> {
  const name = sourceText.trim();
  if (!name) return null;

  const exact = await client.institution.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (exact) return exact.id;

  const [slug] = resolveInstitutionSources(name).slugs;
  if (!slug) return null;

  const canonical = await client.institution.findUnique({
    where: { id: CANONICAL_INSTITUTIONS[slug].id },
  });
  return canonical?.id ?? null;
}
