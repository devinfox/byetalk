"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import Podium from "./Podium";
import LeaderboardTable from "./LeaderboardTable";
import styles from "./salesScoreboard.module.css";
import { SalesRep, getSortedReps } from "@/data/salesReps";
import { supabase, fetchSalesReps } from "@/lib/scoreboard-supabase";

type SalesScoreboardProps = {
  salesReps: SalesRep[];
};

type TakeoverState = {
  isActive: boolean;
  phase: 'fade-out' | 'showing' | 'fade-in' | null;
  newLeader: SalesRep | null;
};

export default function SalesScoreboard({ salesReps: initialSalesReps }: SalesScoreboardProps) {
  const [salesReps, setSalesReps] = useState<SalesRep[]>(initialSalesReps);
  const [isLoading, setIsLoading] = useState(false);
  const [takeover, setTakeover] = useState<TakeoverState>({
    isActive: false,
    phase: null,
    newLeader: null,
  });
  const previousFirstPlaceId = useRef<string | null>(null);
  const isFirstLoad = useRef(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const sortedReps = useMemo(() => getSortedReps(salesReps), [salesReps]);
  const topThree = sortedReps.slice(0, 3);

  // Check for takeover when #1 changes
  useEffect(() => {
    if (sortedReps.length === 0) return;

    const currentFirstPlace = sortedReps[0];

    // Skip takeover on first load
    if (isFirstLoad.current) {
      previousFirstPlaceId.current = currentFirstPlace.id;
      isFirstLoad.current = false;
      return;
    }

    // Check if #1 has changed
    if (previousFirstPlaceId.current && currentFirstPlace.id !== previousFirstPlaceId.current) {
      console.log('TAKEOVER! New #1:', currentFirstPlace.name);
      triggerTakeover(currentFirstPlace);
    }

    previousFirstPlaceId.current = currentFirstPlace.id;
  }, [sortedReps]);

  const triggerTakeover = (newLeader: SalesRep) => {
    // Play the gladiator music
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(err => console.log('Audio play failed:', err));
    }

    // Phase 1: Fade to black
    setTakeover({ isActive: true, phase: 'fade-out', newLeader });

    // Phase 2: Show takeover screen
    setTimeout(() => {
      setTakeover({ isActive: true, phase: 'showing', newLeader });
    }, 1000);

    // Phase 3: Fade back to scoreboard
    setTimeout(() => {
      setTakeover({ isActive: true, phase: 'fade-in', newLeader });
    }, 6000);

    // Phase 4: End takeover and fade out audio
    setTimeout(() => {
      setTakeover({ isActive: false, phase: null, newLeader: null });
      // Fade out audio
      if (audioRef.current) {
        const audio = audioRef.current;
        const fadeOut = setInterval(() => {
          if (audio.volume > 0.1) {
            audio.volume -= 0.1;
          } else {
            audio.pause();
            audio.volume = 1;
            clearInterval(fadeOut);
          }
        }, 100);
      }
    }, 7000);
  };

  // Debounce ref to prevent rapid API calls
  const lastRefreshTime = useRef<number>(0);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const DEBOUNCE_MS = 1000; // Minimum 1 second between refreshes

  // Refresh data function with debouncing
  const refreshData = useCallback(async (immediate = false) => {
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshTime.current;

    // Clear any pending refresh
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }

    // If not immediate and we refreshed recently, schedule a delayed refresh
    if (!immediate && timeSinceLastRefresh < DEBOUNCE_MS) {
      refreshTimeoutRef.current = setTimeout(() => {
        refreshData(true);
      }, DEBOUNCE_MS - timeSinceLastRefresh);
      return;
    }

    lastRefreshTime.current = now;
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

  // Set up realtime subscriptions for deals AND calls tables
  useEffect(() => {
    // Subscribe to ALL deals changes (not just closed_won) to catch stage transitions
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
          console.log('Deal change detected:', payload.eventType, payload);
          refreshData();
        }
      )
      .subscribe((status) => {
        console.log('Deals channel status:', status);
      });

    // Subscribe to calls changes for transfer updates
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
          console.log('Call change detected:', payload.eventType, payload);
          refreshData();
        }
      )
      .subscribe((status) => {
        console.log('Calls channel status:', status);
      });

    // Initial data fetch on mount
    refreshData(true);

    // Periodic polling fallback (every 30 seconds) in case realtime connection drops
    const pollInterval = setInterval(() => {
      console.log('Periodic refresh triggered');
      refreshData(true);
    }, 30000);

    // Cleanup
    return () => {
      supabase.removeChannel(dealsChannel);
      supabase.removeChannel(callsChannel);
      clearInterval(pollInterval);
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [refreshData]);

  return (
    <div className={styles.scoreboard}>
      <div className={styles.backgroundContainer}>
        <div
          className={styles.backgroundImage}
          style={{ backgroundImage: "url(/scoreboard-background.png)" }}
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

      {/* Takeover Audio */}
      <audio ref={audioRef} src="/gladiator-music.wav" preload="auto" />

      {/* Takeover Overlay */}
      {takeover.isActive && (
        <>
          {/* Fade overlay */}
          <div
            className={`${styles.takeoverFade} ${
              takeover.phase === 'fade-out' ? styles.takeoverFadeOut : ''
            } ${
              takeover.phase === 'fade-in' ? styles.takeoverFadeIn : ''
            }`}
          />

          {/* Takeover content */}
          {(takeover.phase === 'showing' || takeover.phase === 'fade-in') && takeover.newLeader && (
            <div className={styles.takeoverScreen}>
              <div className={styles.takeoverContent}>
                <h1 className={styles.takeoverTitle}>TAKEOVER</h1>
                <div className={styles.takeoverAvatarContainer}>
                  <Image
                    src={takeover.newLeader.avatarImage}
                    alt={takeover.newLeader.name}
                    width={400}
                    height={600}
                    className={styles.takeoverAvatar}
                    unoptimized={takeover.newLeader.avatarImage.startsWith('http')}
                  />
                </div>
                <h2 className={styles.takeoverName}>{takeover.newLeader.name}</h2>
                <p className={styles.takeoverSubtitle}>IS NOW #1!</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
