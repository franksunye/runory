import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Runory Solutions | Agent-native CRM, Voice and FSM for Service Businesses",
  description:
    "Explore Runory solutions for home services, HVAC, waterproofing, repair, plumbing, and installation operations—connecting omnichannel intake, CRM, Sales, FSM, and external Super Agents in one governed runtime.",
  alternates: {
    canonical: "https://runory.vercel.app/solutions",
  },
  openGraph: {
    title: "Runory Solutions | Agent-native Service Operations",
    description:
      "Industry-ready operating loops for service businesses, powered by omnichannel intake, CRM, Sales, FSM, and governed Agent execution.",
    url: "https://runory.vercel.app/solutions",
    siteName: "Runory",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Runory Solutions | Agent-native Service Operations",
    description:
      "Connect customer conversations, sales workflows, field execution, and external Super Agents in one governed operating system.",
  },
};

export default function SolutionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
