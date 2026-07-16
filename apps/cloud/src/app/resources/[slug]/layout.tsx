import type { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://runory.vercel.app";

const resourceMeta: Record<string, { title: string; description: string }> = {
  "agent-native-field-service": {
    title: "What Agent-native Field Service Software Actually Means",
    description: "Why the Agent should become the operating interface while the business system remains the governed source of truth.",
  },
  "voice-intake-to-work-order": {
    title: "From Phone Call to Work Order Without Duplicate Entry",
    description: "A practical operating model for converting voice and messaging conversations into CRM, Sales, and FSM execution.",
  },
  "focused-fsm-pilot": {
    title: "How to Scope a Field Service Pilot That Can Launch Quickly",
    description: "Choose one measurable workflow, constrain integrations, and prove operational value before expanding.",
  },
  "external-agents-for-sme-software": {
    title: "Why External Agents Are the Future of SME Software",
    description: "How Super Agents and governed business runtimes will reshape the way small and medium businesses operate software.",
  },
  "crm-sales-fsm-operating-loop": {
    title: "CRM + Sales + FSM: One Operating Loop for Service Businesses",
    description: "Why customer acquisition, sales execution, and field operations should work as one connected business loop.",
  },
  "fsm-pilot-in-1-2-weeks": {
    title: "How to Launch an FSM Pilot in 1–2 Weeks",
    description: "A practical execution playbook using reusable modules, focused configuration, and Agent-assisted implementation.",
  },
};

type LayoutProps = { children: React.ReactNode; params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { slug } = await params;
  const item = resourceMeta[slug];
  if (!item) return {};
  const canonical = `${siteUrl}/resources/${slug}`;
  return {
    alternates: { canonical },
    openGraph: { title: item.title, description: item.description, url: canonical, siteName: "Runory", type: "article" },
    twitter: { card: "summary_large_image", title: item.title, description: item.description },
  };
}

export default async function ResourceArticleLayout({ children, params }: LayoutProps) {
  const { slug } = await params;
  const item = resourceMeta[slug];
  const canonical = `${siteUrl}/resources/${slug}`;
  const schema = item ? {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: item.title,
    description: item.description,
    mainEntityOfPage: canonical,
    url: canonical,
    author: { "@type": "Organization", name: "Runory" },
    publisher: { "@type": "Organization", name: "Runory", url: siteUrl },
    about: ["Field service management", "Agent-native software", "Service business operations"],
  } : null;

  return <>{schema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />}{children}</>;
}
