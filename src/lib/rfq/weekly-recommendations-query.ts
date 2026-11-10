import { queryOptions } from "@tanstack/react-query";
import { readWeeklyRecommendations } from "./weekly-recommendations.functions";
export const weeklyRecommendationsQuery = queryOptions({
  queryKey: ["weekly-buyer-recommendations"],
  queryFn: () => readWeeklyRecommendations(),
  staleTime: 10_000,
  refetchInterval: 30_000,
  retry: 1,
});
