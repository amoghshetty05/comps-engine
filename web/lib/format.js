const DASH = "—";

/** Rs crore with Indian digit grouping, e.g. 1,23,456. */
export const crore = (v) =>
  v == null ? DASH : `₹${Math.round(v).toLocaleString("en-IN")} cr`;

export const multiple = (v) => (v == null ? DASH : `${Number(v).toFixed(1)}x`);
export const pct = (v) => (v == null ? DASH : `${Number(v).toFixed(1)}%`);
export const price = (v) =>
  v == null ? DASH : `₹${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export const date = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : DASH;
