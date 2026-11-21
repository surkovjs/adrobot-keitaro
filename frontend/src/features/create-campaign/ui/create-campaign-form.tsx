import {
  campaignPreferences,
  rememberCampaignPreferences,
} from '@/features/create-campaign/model/campaign-preferences'
import headingStyles from '@/shared/ui/page-heading.module.css'
import buttonStyles from '@/shared/ui/button.module.css'
import fieldStyles from '@/shared/ui/form-controls.module.css'
import animationStyles from '@/shared/ui/animation.module.css'
import panelStyles from '@/shared/ui/panel.module.css'
import styles from './create-campaign-form.module.css'
import { useIdempotencyKey } from '@/shared/lib/use-idempotency-key'
import { cx } from '@/shared/lib/class-names'
import { useEffect, useState, type SubmitEvent } from 'react'
import {
  CircleHelp,
  ExternalLink,
  Globe2,
  Layers3,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  X,
} from 'lucide-react'
import { errorMessage, write } from '@/shared/api/client'
import { Notice } from '@/shared/ui/notice'
import { OfferPicker } from '@/entities/offer/ui/offer-picker'
import { SelectField } from '@/shared/ui/select-field'
import type { Catalog } from '@/entities/tracker/model/types'
import type { Reference } from '@/shared/model/reference'

export default function CreateCampaignForm({
  catalog,
  offers,
  onCreated,
  onCancel,
  onDirty,
  onBusy,
  trackerUrl,
}: {
  catalog: Catalog
  offers: Reference[]
  onCreated: (id: number) => void
  onCancel: () => void
  onDirty: (value: boolean) => void
  onBusy: (value: boolean) => void
  trackerUrl?: string | null
}) {
  const [name, setName] = useState('')
  const [geo, setGeo] = useState('AU')
  const [offer, setOffer] = useState<Reference | null>(null)
  const [domain, setDomain] = useState(
    catalog.domains.length === 1 ? String(catalog.domains[0].id) : '',
  )
  const [preferences] = useState(() => campaignPreferences(trackerUrl, catalog))
  const [group, setGroup] = useState(preferences.group)
  const [source, setSource] = useState(preferences.source)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const request = useIdempotencyKey({ name, geo, offer, domain, group, source })
  useEffect(() => {
    onDirty(Boolean(name || offer))
  }, [name, offer, onDirty])
  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!offer) {
      setError('Выберите оффер из списка')
      return
    }
    setPending(true)
    onBusy(true)
    setError('')
    try {
      const result = await write<{ id: number }>(
        '/campaigns',
        'POST',
        {
          name,
          geo,
          offer_id: offer.id,
          domain_id: Number(domain),
          group_id: Number(group),
          traffic_source_id: Number(source),
        },
        request.getKey(),
      )
      rememberCampaignPreferences(trackerUrl, group, source)
      onDirty(false)
      onCreated(result.id)
    } catch (error) {
      request.onError(error)
      setError(errorMessage(error))
    } finally {
      setPending(false)
      onBusy(false)
    }
  }
  const selectedCountry = catalog.countries.find((v) => v.code === geo)
  return (
    <>
      <div className={headingStyles['page-heading']}>
        <div>
          <div className={headingStyles.eyebrow}>CAMPAIGN BUILDER</div>
          <h1 className={headingStyles.title}>Новая кампания</h1>
          <p>Основные параметры — и два потока готовы к работе.</p>
        </div>
        <button
          className={cx(buttonStyles.button, buttonStyles.secondary)}
          disabled={pending}
          onClick={onCancel}
        >
          <X size={16} />
          Отмена
        </button>
      </div>
      {error && <Notice close={() => setError('')}>{error}</Notice>}
      <form className={styles['create-layout']} onSubmit={submit}>
        <div className={cx(panelStyles.panel, styles['form-panel'])}>
          <div className={styles['panel-heading']}>
            <div className={styles['heading-icon']}>
              <Settings2 size={19} />
            </div>
            <div>
              <h2>Параметры кампании</h2>
              <p>Данные и справочники Keitaro</p>
            </div>
          </div>
          <fieldset className={styles.fieldset} disabled={pending}>
            <label className={fieldStyles.field}>
              <span>
                Название кампании{' '}
                <span className={fieldStyles.required}>*</span>
              </span>
              <input
                className={fieldStyles.input}
                required
                autoFocus
                maxLength={200}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например, Beauty · Romania · November"
              />
            </label>
            <label className={fieldStyles.field}>
              <span>
                Страна для первого потока{' '}
                <span className={fieldStyles.required}>*</span>
              </span>
              <select
                className={fieldStyles.select}
                value={geo}
                onChange={(e) => setGeo(e.target.value)}
              >
                {catalog.countries.map((v) => (
                  <option key={v.code} value={v.code}>
                    {v.code} · {v.name}
                  </option>
                ))}
              </select>
              <small>Посетители из этой страны попадут на Google.</small>
            </label>
            <div className={fieldStyles.field}>
              <span>
                Оффер <span className={fieldStyles.required}>*</span>
              </span>
              {offer ? (
                <div className={styles['selected-offer']}>
                  <span>
                    <small>#{offer.id}</small>
                    {offer.name}
                  </span>
                  <button
                    type="button"
                    className={buttonStyles['icon-button']}
                    onClick={() => setOffer(null)}
                    aria-label="Убрать выбранный оффер"
                  >
                    <X size={17} />
                  </button>
                </div>
              ) : (
                <OfferPicker offers={offers} onSelect={setOffer} />
              )}
            </div>
            <div className={styles['form-divider']} />
            <SelectField
              label="Домен"
              value={domain}
              onChange={setDomain}
              items={catalog.domains}
            />
            <div className={styles['field-grid']}>
              <SelectField
                label="Группа"
                value={group}
                onChange={setGroup}
                items={catalog.groups}
              />
              <SelectField
                label="Источник трафика"
                value={source}
                onChange={setSource}
                items={catalog.sources}
              />
            </div>
          </fieldset>
          <div className={styles['form-footer']}>
            <span>
              <ShieldCheck size={16} />
              Проверка параметров перед созданием
            </span>
            <button
              type="submit"
              className={cx(buttonStyles.button, buttonStyles.primary)}
              disabled={
                pending ||
                !offer ||
                !name.trim() ||
                !domain ||
                !group ||
                !source
              }
            >
              {pending ? (
                <RefreshCw size={16} className={animationStyles.spin} />
              ) : (
                <Plus size={17} />
              )}
              {pending ? 'Создание…' : 'Создать кампанию'}
            </button>
          </div>
        </div>
        <aside className={styles['flow-preview']}>
          <div className={headingStyles.eyebrow}>ПРЕДПРОСМОТР</div>
          <h2>Как пойдёт трафик</h2>
          <p>Потоки проверяются по порядку.</p>
          <div className={styles['traffic-entry']}>
            <Globe2 size={18} />
            <span>Входящий трафик</span>
          </div>
          <div className={styles['flow-connector']} />
          <div className={styles['preview-step']}>
            <span className={styles['step-badge']}>1</span>
            <div>
              <h3>Проверка страны</h3>
              <p>
                {selectedCountry?.code} · {selectedCountry?.name}
              </p>
              <div className={styles.destination}>
                <ExternalLink size={14} />
                google.com
              </div>
            </div>
          </div>
          <div className={styles['flow-connector']}>
            <span>Остальные посетители</span>
          </div>
          <div className={styles['preview-step']}>
            <span className={styles['step-badge']}>2</span>
            <div>
              <h3>Переход на оффер</h3>
              <p>{offer?.name ?? 'Выберите оффер в форме'}</p>
              <div className={styles.destination}>
                <Layers3 size={14} />
                100% трафика потока
              </div>
            </div>
          </div>
          <div className={styles['preview-note']}>
            <CircleHelp size={17} />
            <p>Кампания включится после успешного создания обоих потоков.</p>
          </div>
        </aside>
      </form>
    </>
  )
}
