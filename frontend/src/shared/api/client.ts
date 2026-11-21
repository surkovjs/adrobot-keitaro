export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public outcome?: 'failed' | 'unknown',
  ) {
    super(message)
  }
}

function message(value: unknown): string {
  if (typeof value === 'string')
    return value.replace(/(^|; )Value error, /g, '$1')
  if (Array.isArray(value))
    return value
      .map((v) =>
        typeof v === 'object' && v && 'msg' in v ? message(v.msg) : message(v),
      )
      .join('; ')
  if (value && typeof value === 'object') {
    const info = value as {
      message?: unknown
      campaign_id?: number
      recovery?: string
    }
    return [
      message(
        info.message ?? 'Результат операции неизвестен. Обновите данные.',
      ),
      info.campaign_id ? `Кампания #${info.campaign_id}.` : '',
      info.recovery,
    ]
      .filter(Boolean)
      .join(' ')
  }
  return 'Не удалось выполнить запрос'
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch('/api' + path, init)
  } catch {
    throw new ApiError(
      'Нет связи с сервером. Проверьте, что FastAPI запущен.',
      0,
    )
  }
  const data = await response.json().catch(() => null)
  if (!response.ok)
    throw new ApiError(
      message(data?.detail ?? data),
      response.status,
      data?.detail?.outcome,
    )
  return data as T
}

export function write<T>(
  path: string,
  method: string,
  body: unknown,
  key: string,
) {
  return api<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(body),
  })
}

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Не удалось выполнить действие'
