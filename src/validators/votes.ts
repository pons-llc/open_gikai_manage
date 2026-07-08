export const voteResults = ["for", "against", "abstain", "absent"] as const;
export type VoteResult = (typeof voteResults)[number];

export const voteResultLabels: Record<VoteResult, string> = {
  for: "賛成",
  against: "反対",
  abstain: "棄権",
  absent: "欠席",
};

export const isVoteResult = (v: string): v is VoteResult => (voteResults as readonly string[]).includes(v);
