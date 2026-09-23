/** "2018-05-14" -> "May 2018". Safe on server and client. */
export const fmt = (d?: string) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "");
