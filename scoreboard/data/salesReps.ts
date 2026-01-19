export type SalesRep = {
  id: string;
  name: string;
  weeklyRevenue: number;
  dailyTransfers: number;
  weeklyTransfers: number;
  avatarImage: string;
};

// Dummy data - not used when connected to Supabase
// Keeping for fallback purposes
export const salesRepsData: SalesRep[] = [
  {
    id: "1",
    name: "Marcus Mitchell",
    weeklyRevenue: 152000,
    dailyTransfers: 10,
    weeklyTransfers: 45,
    avatarImage: "/guy-1.png",
  },
  {
    id: "2",
    name: "James Carter",
    weeklyRevenue: 145500,
    dailyTransfers: 9,
    weeklyTransfers: 40,
    avatarImage: "/guy-2.png",
  },
  {
    id: "3",
    name: "Ethan Ross",
    weeklyRevenue: 138000,
    dailyTransfers: 8,
    weeklyTransfers: 37,
    avatarImage: "/guy-3.png",
  },
  {
    id: "4",
    name: "David Lewis",
    weeklyRevenue: 120300,
    dailyTransfers: 7,
    weeklyTransfers: 30,
    avatarImage: "/guy-1.png",
  },
  {
    id: "5",
    name: "Ryan Adams",
    weeklyRevenue: 110000,
    dailyTransfers: 7,
    weeklyTransfers: 39,
    avatarImage: "/guy-2.png",
  },
  {
    id: "6",
    name: "Tyler Bennett",
    weeklyRevenue: 105000,
    dailyTransfers: 6,
    weeklyTransfers: 32,
    avatarImage: "/guy-3.png",
  },
  {
    id: "7",
    name: "Nathan Cole",
    weeklyRevenue: 98500,
    dailyTransfers: 6,
    weeklyTransfers: 28,
    avatarImage: "/guy-1.png",
  },
  {
    id: "8",
    name: "Brandon Hayes",
    weeklyRevenue: 92000,
    dailyTransfers: 5,
    weeklyTransfers: 25,
    avatarImage: "/guy-2.png",
  },
  {
    id: "9",
    name: "Kevin Parker",
    weeklyRevenue: 87500,
    dailyTransfers: 5,
    weeklyTransfers: 23,
    avatarImage: "/guy-3.png",
  },
  {
    id: "10",
    name: "Derek Morgan",
    weeklyRevenue: 82000,
    dailyTransfers: 4,
    weeklyTransfers: 20,
    avatarImage: "/guy-1.png",
  },
];

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const getSortedReps = (reps: SalesRep[]): SalesRep[] => {
  return [...reps].sort((a, b) => b.weeklyRevenue - a.weeklyRevenue);
};
