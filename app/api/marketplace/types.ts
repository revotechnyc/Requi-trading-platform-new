export interface MarketplaceSeed {
  slug: string;
  name: string;
  author: string;
  kind: "Strategy" | "AI Prompt";
  asset: string;
  price: number;
  category: string;
  description: string;
  outcome: string;
  tags: string[];
  prompt: string;
}
