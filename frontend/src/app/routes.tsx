import { Navigate, type RouteObject } from 'react-router-dom'
import App from './app'
import CampaignsPage from '@/pages/campaigns-page'
import CreateCampaignPage from '@/pages/create-campaign-page'
import CampaignEditorPage from '@/pages/campaign-editor-page'
import NotFoundPage from '@/pages/not-found-page'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/campaigns" replace /> },
      {
        path: 'campaigns',
        element: <CampaignsPage />,
        handle: { title: 'Кампании' },
      },
      {
        path: 'campaigns/new',
        element: <CreateCampaignPage />,
        handle: { title: 'Новая кампания' },
      },
      {
        path: 'campaigns/:campaignId',
        element: <CampaignEditorPage />,
        handle: { title: 'Редактор кампании' },
      },
      {
        path: '*',
        element: <NotFoundPage />,
        handle: { title: 'Страница не найдена' },
      },
    ],
  },
]
