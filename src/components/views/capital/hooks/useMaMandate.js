// Spanavi 統合で company_profiles (ma_mandate) を廃止したため noop stub。
// PipelinePage 等が import している useBudgetForecast は常に unconfigured を返す。
import { useQuery } from '@tanstack/react-query';

export function useMaMandate() {
  return { data: null, isLoading: false };
}

export function useSaveMaMandate() {
  return {
    mutate: () => {},
    mutateAsync: async () => {},
    isPending: false,
  };
}

export function useBudgetForecast() {
  return useQuery({
    queryKey: ['budget-forecast'],
    queryFn: async () => ({ configured: false }),
    staleTime: Infinity,
  });
}
