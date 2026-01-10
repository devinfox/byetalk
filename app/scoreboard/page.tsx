import SalesScoreboard from "@/components/scoreboard/SalesScoreboard";
import { SalesRep } from "@/data/salesReps";

async function getSalesReps(): Promise<SalesRep[]> {
  // Fetch from the API route which has service role access
  const baseUrl = process.env.NEXT_PUBLIC_CRM_API_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  try {
    const response = await fetch(`${baseUrl}/api/scoreboard`, {
      next: { revalidate: 10 }, // Revalidate every 10 seconds
    });
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.error("Error fetching from scoreboard API:", error);
  }

  // Fallback to empty array if API unavailable
  console.warn("Scoreboard API unavailable, returning empty array");
  return [];
}

export default async function ScoreboardPage() {
  const salesReps = await getSalesReps();

  return (
    <main>
      <SalesScoreboard salesReps={salesReps} />
    </main>
  );
}
