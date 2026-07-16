import { buildMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata = buildMarketingMetadata({
  title: "Agent-native CRM, Sales and FSM Product",
  description: "Explore Runory's unified product for omnichannel intake, CRM, Sales, field service management, external Super Agents, and governed business execution.",
  path: "/product",
  keywords: ["agent-native CRM", "field service product", "sales and FSM", "service business software"],
});

export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return children;
}
