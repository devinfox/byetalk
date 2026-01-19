import SalesScoreboard from "@/components/SalesScoreboard/SalesScoreboard";
import { SalesRep } from "@/data/salesReps";

async function getSalesReps(): Promise<SalesRep[]> {
  // Fetch from CRM API which has service role access
  const crmApiUrl = process.env.NEXT_PUBLIC_CRM_API_URL;

  if (crmApiUrl) {
    try {
      const response = await fetch(`${crmApiUrl}/api/scoreboard`, {
        next: { revalidate: 10 }, // Revalidate every 10 seconds
      });
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error("Error fetching from CRM API:", error);
    }
  }

  // Fallback to empty array if CRM API unavailable
  console.warn("CRM API unavailable, returning empty array");
  return [];
}

export default async function Home() {
  const salesReps = await getSalesReps();

  return (
    <main>
      <SalesScoreboard salesReps={salesReps} />
    </main>
  );
}
