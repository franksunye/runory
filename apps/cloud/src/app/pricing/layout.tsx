import { buildMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata = buildMarketingMetadata({
  title: "Runory Pricing for Voice, CRM, Sales and FSM",
  description: "Compare Runory Starter, Growth, Pro, and Enterprise plans for service operations, including voice intake minutes, implementation scope, and provider usage.",
  path: "/pricing",
  keywords: ["FSM pricing", "AI voice intake pricing", "service operations software pricing", "Runory plans"],
});

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
