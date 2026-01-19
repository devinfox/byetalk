"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import Podium from "./Podium";
import LeaderboardTable from "./LeaderboardTable";
import styles from "./salesScoreboard.module.css";
import { SalesRep, getSortedReps } from "@/data/salesReps";
import { supabase, fetchSalesReps } from "@/lib/supabase";

type SalesScoreboardProps = {
  salesReps: SalesRep[];
};

export default function SalesScoreboard({ salesReps: initialSalesReps }: SalesScoreboardProps) {
  const [salesReps, setSalesReps] = useState<SalesRep[]>(initialSalesReps);
  const [isLoading, setIsLoading] = useState(false);

  const sortedReps = useMemo(() => getSortedReps(salesReps), [salesReps]);
  const topThree = sortedReps.slice(0, 3);

  // Refresh data function
  const refreshData = useCallback(async () => {
    setIsLoading(true);
    try {
      const newData = await fetchSalesReps();
      if (newData.length > 0) {
        setSalesReps(newData);
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Set up realtime subscriptions and polling
  useEffect(() => {
    // Subscribe to deals changes (for revenue updates)
    const dealsChannel = supabase
      .channel('scoreboard-deals')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deals',
        },
        (payload) => {
          console.log('Deal change detected:', payload.eventType);
          refreshData();
        }
      )
      .subscribe((status) => {
        console.log('Deals channel status:', status);
      });

    // Subscribe to users changes (for avatar updates)
    const usersChannel = supabase
      .channel('scoreboard-users')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
        },
        (payload) => {
          console.log('User change detected:', payload.eventType);
          refreshData();
        }
      )
      .subscribe((status) => {
        console.log('Users channel status:', status);
      });

    // Subscribe to calls changes (for transfer overs)
    const callsChannel = supabase
      .channel('scoreboard-calls')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'calls',
        },
        (payload) => {
          console.log('Call change detected:', payload.eventType);
          refreshData();
        }
      )
      .subscribe((status) => {
        console.log('Calls channel status:', status);
      });

    // Initial data fetch
    refreshData();

    // Polling fallback - refresh every 15 seconds
    const pollInterval = setInterval(() => {
      console.log('Polling refresh...');
      refreshData();
    }, 15000);

    // Cleanup
    return () => {
      supabase.removeChannel(dealsChannel);
      supabase.removeChannel(usersChannel);
      supabase.removeChannel(callsChannel);
      clearInterval(pollInterval);
    };
  }, [refreshData]);

  return (
    <div className={styles.scoreboard}>
      <div className={styles.backgroundContainer}>
        <div
          className={styles.backgroundImage}
          style={{ backgroundImage: "url(/background.png)" }}
        />
        <div className={styles.backgroundOverlay} />
      </div>

      <div className={styles.content}>
        <header className={styles.header}>
          <h1 className={styles.title}>
            <span className={styles.titleLine} />
            CITADEL GOLD
            <span className={styles.titleLine} />
          </h1>
          <div className={styles.subtitleRow}>
            <h2 className={styles.subtitle}>SALES PERFORMANCE SCOREBOARD</h2>
            <div className={styles.jackpotContainer}>
              <div className={styles.jackpotInner}>
                <span className={styles.jackpotLabel}>WEEKLY CHAMPION PRIZE</span>
                <span className={styles.jackpotAmount}>$500</span>
              </div>
            </div>
          </div>
        </header>

        <section className={styles.podiumSection}>
          <Podium topThree={topThree} />
        </section>

        <section className={styles.tableSection}>
          <LeaderboardTable reps={sortedReps} />
          {isLoading && (
            <div className={styles.loadingIndicator}>
              Updating...
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
