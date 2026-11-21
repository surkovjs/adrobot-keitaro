import buttonStyles from '@/shared/ui/button.module.css'
import headingStyles from '@/shared/ui/page-heading.module.css'
import animationStyles from '@/shared/ui/animation.module.css'
import panelStyles from '@/shared/ui/panel.module.css'
import stateStyles from '@/shared/ui/empty-state.module.css'
import styles from './campaign-editor-page.module.css'
import { cx } from '@/shared/lib/class-names'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Layers3,
  RefreshCw,
} from 'lucide-react'
import { useWorkspace } from '@/app/providers/workspace-provider'
import { useCampaign } from '@/entities/campaign/model/use-campaign'
import { useUnsavedChanges } from '@/shared/lib/use-unsaved-changes'
import { LoadingState } from '@/shared/ui/loading-state'
import { Notice } from '@/shared/ui/notice'
import StreamEditor from '@/features/edit-stream-offers/ui/stream-editor'
import NotFoundPage from './not-found-page'

export default function CampaignEditorPage() {
  const { campaignId: routeId } = useParams()
  const campaignId =
    routeId &&
    /^[1-9]\d*$/.test(routeId) &&
    Number.isSafeInteger(Number(routeId))
      ? Number(routeId)
      : null
  const {
    campaign,
    loading: campaignLoading,
    error,
    dismissError,
    reload,
    updateStream,
  } = useCampaign(campaignId)
  const { offers, health } = useWorkspace()
  const guard = useUnsavedChanges()
  const navigate = useNavigate()
  const location = useLocation()
  const [createdDismissed, setCreatedDismissed] = useState(false)
  useEffect(() => {
    setCreatedDismissed(false)
  }, [campaignId])
  async function refreshCampaign() {
    if (guard.busy) return
    if (
      guard.hasChanges() &&
      !window.confirm(
        'Отменить несохранённые изменения и загрузить поток заново?',
      )
    )
      return
    if (await reload()) guard.reset()
  }
  if (!campaignId) return <NotFoundPage />
  return (
    <>
      {guard.navigationMessage && (
        <Notice close={guard.dismissNavigationMessage}>
          {guard.navigationMessage}
        </Notice>
      )}
      {error && (
        <Notice close={dismissError}>
          {error}{' '}
          <button
            className={buttonStyles['text-button']}
            onClick={() => void refreshCampaign()}
          >
            Повторить загрузку
          </button>
        </Notice>
      )}
      {campaignLoading && <LoadingState label="Загружаем данные Keitaro" />}
      {campaign && (
        <>
          {location.state?.created && !createdDismissed && (
            <Notice success close={() => setCreatedDismissed(true)}>
              Кампания «{campaign.name}» создана
            </Notice>
          )}
          <button
            className={styles['back-link']}
            disabled={campaignLoading || guard.busy}
            onClick={() => void navigate('/campaigns')}
          >
            <ArrowLeft size={16} />
            Все кампании
          </button>
          <div
            className={cx(
              headingStyles['page-heading'],
              styles['editor-heading'],
            )}
          >
            <div>
              <div className={headingStyles.eyebrow}>
                РЕДАКТОР КАМПАНИИ · #{campaign.id}
              </div>
              <h1 className={headingStyles.title}>{campaign.name}</h1>
              <p>Управляйте офферами и долями трафика в каждом потоке.</p>
            </div>
            <div className={styles['heading-actions']}>
              <button
                className={cx(buttonStyles.button, buttonStyles.secondary)}
                disabled={campaignLoading || guard.busy}
                onClick={() => void refreshCampaign()}
              >
                <RefreshCw
                  size={16}
                  className={campaignLoading ? animationStyles.spin : undefined}
                />
                Загрузить из Keitaro
              </button>
              {health?.tracker_url && (
                <a
                  className={cx(buttonStyles.button, buttonStyles.secondary)}
                  href={`${health.tracker_url}/admin/#!/campaigns/${campaign.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={16} />В Keitaro
                </a>
              )}
            </div>
          </div>
          <div className={styles['editor-intro']}>
            <CheckCircle2 size={17} />
            <span>
              Добавляйте офферы, задавайте доли и сохраняйте готовые изменения.
            </span>
            <span>{campaign.streams.length} потока</span>
          </div>
          {campaign.streams.length === 0 && (
            <div className={cx(panelStyles.panel, stateStyles['empty-state'])}>
              <Layers3 size={28} />
              <h3>В кампании нет потоков</h3>
              <p>Добавьте поток в Keitaro, затем обновите данные.</p>
            </div>
          )}
          {campaign.streams.map((stream) => (
            <StreamEditor
              key={`${campaign.id}-${stream.id}`}
              stream={stream}
              campaignId={campaign.id}
              offers={offers}
              trackerUrl={health?.tracker_url ?? null}
              onBusy={(value) => guard.reportBusy(value, stream.id)}
              reportDirty={guard.reportDirty}
              onSaved={updateStream}
              onReload={refreshCampaign}
            />
          ))}
        </>
      )}
    </>
  )
}
