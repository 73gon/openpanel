import { createFileRoute } from '@tanstack/react-router'
import { fetchAllSeries } from '@/lib/api'
import { HomePage } from '@/components/home-page'

export const Route = createFileRoute('/')({
  loader: async () => {
    const data = await fetchAllSeries()
    return { series: data.series }
  },
  component: HomePage,
})
