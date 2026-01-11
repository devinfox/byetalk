import SalesScoreboard from "@/components/scoreboard/SalesScoreboard";
import { SalesRep } from "@/data/salesReps";

async function getSalesReps(): Promise<SalesRep[]> {
  // During build time, return empty array to avoid timeout
  if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
    return [];
  }

  // Fetch from the API route which has service role access
  const baseUrl = process.env.NEXT_PUBLIC_CRM_API_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(`${baseUrl}/api/scoreboard`, {
      next: { revalidate: 10 }, // Revalidate every 10 seconds
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      console.warn("Scoreboard API timeout, returning empty array");
    } else {
      console.error("Error fetching from scoreboard API:", error);
    }
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
