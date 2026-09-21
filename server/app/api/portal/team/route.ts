import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { organizationMemberships, organizations } from "@/db/schema";
import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { listCoverageGaps, listOrganizationRoster, listOrganizationMembers } from "@/lib/team-management";

/**
 * GET — the team view for every organization this professional administers.
 * Returns nothing for a plain `professional`: managing the team is an
 * owner/admin capability, and hiding the tab is not authorization on its own.
 */
export async function GET(request: Request) {
  const session = await getSessionUser(request);
  if (!session) return unauthorized();

  const managed = await db.select({
    organizationId: organizations.id,
    organizationName: organizations.name,
    orgRole: organizationMemberships.orgRole,
  })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(and(
      eq(organizationMemberships.userId, session.id),
      eq(organizationMemberships.status, "active"),
    ));

  const administered = managed.filter(row => row.orgRole === "owner" || row.orgRole === "admin");
  if (!administered.length) return Response.json({ organizations: [] });

  const result = await Promise.all(administered.map(async (organization) => {
    const [members, roster, gaps] = await Promise.all([
      listOrganizationMembers(session.id, organization.organizationId),
      listOrganizationRoster(organization.organizationId),
      listCoverageGaps(organization.organizationId),
    ]);
    return { ...organization, members: members ?? [], roster, gaps };
  }));

  return Response.json({ organizations: result });
}
