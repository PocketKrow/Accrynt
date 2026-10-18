import { watch } from 'vue'
import { useRoute } from 'vue-router'
import { monthKeySchema } from '../domain/models'
import { useFinanceStore } from '../stores/finance'

/** Only accept bounded, known query values. Context links never write records. */
export function useRouteMonth() {
  const route = useRoute(), store = useFinanceStore()
  watch(() => route.query.month, value => {
    const month = monthKeySchema.safeParse(value)
    if (month.success) store.month = month.data
  }, { immediate: true })
  return route
}
