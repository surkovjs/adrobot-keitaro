import { useNavigate } from 'react-router-dom'
import { Notice } from '@/shared/ui/notice'
import CreateCampaignForm from '@/features/create-campaign/ui/create-campaign-form'
import { LoadingState } from '@/shared/ui/loading-state'
import { useWorkspace } from '@/app/providers/workspace-provider'
import { useUnsavedChanges } from '@/shared/lib/use-unsaved-changes'

export default function CreateCampaignPage() {
  const { catalog, offers, loading, refreshCampaigns, health } = useWorkspace()
  const guard = useUnsavedChanges()
  const navigate = useNavigate()
  if (!catalog)
    return loading ? <LoadingState label="Загружаем данные Keitaro" /> : null
  return (
    <>
      {guard.navigationMessage && (
        <Notice close={guard.dismissNavigationMessage}>
          {guard.navigationMessage}
        </Notice>
      )}
      <CreateCampaignForm
        catalog={catalog}
        trackerUrl={health?.tracker_url}
        offers={offers}
        onBusy={guard.reportBusy}
        onDirty={guard.reportFormDirty}
        onCancel={() => void navigate('/campaigns')}
        onCreated={(id) => {
          guard.discardAndLeave()
          void refreshCampaigns()
          void navigate(`/campaigns/${id}`, { state: { created: true } })
        }}
      />
    </>
  )
}
