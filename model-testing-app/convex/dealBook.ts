import { query } from "./_generated/server";
import { computePortfolioStats } from "./lib/dealBook";

/** Portfolio aggregates for the Deal Book stats bar (over the projects table). */
export const stats = query({
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.db
      .query("projects")
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();
    return computePortfolioStats(
      projects.map((p) => ({
        status: p.status,
        loanAmount: p.loanAmount,
        endDate: p.endDate,
      })),
      new Date().toISOString(),
    );
  },
});
