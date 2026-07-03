import { redirect } from "next/navigation";

// Spec §10: /w/{workspaceId}/quote-approvals redirects to My Work filtered to
// pending quote approvals.
export default async function QuoteApprovalsRedirectPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  redirect(`/w/${workspaceId}/my-work?kind=approval&subjectType=quote`);
}
