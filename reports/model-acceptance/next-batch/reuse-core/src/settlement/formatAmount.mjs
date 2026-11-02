// Input is integer cents, output is display text.
export const formatAmount=cents=>`$${(cents/100).toFixed(2)}`;
