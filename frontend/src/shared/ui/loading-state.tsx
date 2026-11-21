import animationStyles from './animation.module.css'
import stateStyles from './empty-state.module.css'
import { RefreshCw } from 'lucide-react'

export function LoadingState({
  label = 'Загружаем данные…',
}: {
  label?: string
}) {
  return (
    <div className={stateStyles['empty-state']}>
      <RefreshCw className={animationStyles.spin} size={27} />
      <h3>{label}</h3>
    </div>
  )
}
