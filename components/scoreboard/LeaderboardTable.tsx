import Image from "next/image";
import styles from "./salesScoreboard.module.css";
import { SalesRep, formatCurrency } from "@/data/salesReps";

type LeaderboardTableProps = {
  reps: SalesRep[];
};

const ROW_COLORS = [
  "#5c2a2a", // Row 1 - dark maroon/brown
  "#3d3d3d", // Row 2 - dark gray
  "#4a3528", // Row 3 - brown
  "#3a3a42", // Row 4 - slate gray
  "#4d2828", // Row 5 - dark red/brown
];

export default function LeaderboardTable({ reps }: LeaderboardTableProps) {
  return (
    <div className={styles.tableContainer}>
      <table className={styles.leaderboardTable}>
        <thead>
          <tr className={styles.tableHeader}>
            <th>RANK</th>
            <th className={styles.employeeNameHeader}>EMPLOYEE NAME</th>
            <th>WEEKLY REVENUE ($)</th>
            <th>DAILY<br /><span className={styles.toText}>T.O's</span></th>
            <th>WEEKLY<br /><span className={styles.toText}>T.O's</span></th>
          </tr>
        </thead>
        <tbody>
          {reps.map((rep, index) => (
            <tr
              key={rep.id}
              className={styles.tableRow}
              style={{
                ["--row-bg-color" as string]:
                  ROW_COLORS[index % ROW_COLORS.length],
              }}
            >
              <td className={styles.rankCell}>
                <span className={styles.rankBadge}>{index + 1}</span>
              </td>
              <td className={styles.nameCell}>
                <div className={styles.nameCellContent}>
                  <div className={styles.avatarSmall}>
                    <Image
                      src={rep.avatarImage}
                      alt={rep.name}
                      width={40}
                      height={40}
                      className={styles.avatarImage}
                    />
                  </div>
                  <span>{rep.name}</span>
                </div>
              </td>
              <td className={styles.revenueCell}>
                {formatCurrency(rep.weeklyRevenue)}
              </td>
              <td className={styles.transferCell}>{rep.dailyTransfers}</td>
              <td className={styles.transferCell}>{rep.weeklyTransfers}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
