import Image from "next/image";
import styles from "./salesScoreboard.module.css";
import { SalesRep } from "@/data/salesReps";

type PodiumProps = {
  topThree: SalesRep[];
};

export default function Podium({ topThree }: PodiumProps) {
  const [first, second, third] = topThree;

  // Use each user's avatarImage (custom or default assigned based on their ID)
  return (
    <div className={styles.podiumContainer}>
      <Image
        src="/stone-pedestal.png"
        alt="Stone pedestal"
        width={700}
        height={300}
        className={styles.pedestalImage}
        priority
      />

      {/* Second place - left position */}
      {second && (
        <div className={`${styles.characterSlot} ${styles.characterSecond}`}>
          <Image
            src={second.avatarImage}
            alt={`${second.name} - Rank 2`}
            width={200}
            height={300}
            className={styles.characterImage}
            priority
            unoptimized={second.avatarImage.startsWith('http')}
          />
        </div>
      )}

      {/* First place - center position */}
      {first && (
        <div className={`${styles.characterSlot} ${styles.characterFirst}`}>
          <Image
            src={first.avatarImage}
            alt={`${first.name} - Rank 1`}
            width={200}
            height={300}
            className={styles.characterImage}
            priority
            unoptimized={first.avatarImage.startsWith('http')}
          />
        </div>
      )}

      {/* Third place - right position */}
      {third && (
        <div className={`${styles.characterSlot} ${styles.characterThird}`}>
          <Image
            src={third.avatarImage}
            alt={`${third.name} - Rank 3`}
            width={200}
            height={300}
            className={styles.characterImage}
            priority
            unoptimized={third.avatarImage.startsWith('http')}
          />
        </div>
      )}
    </div>
  );
}
