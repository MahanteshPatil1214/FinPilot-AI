import { Route, Routes } from 'react-router-dom'

import { AppShell } from './components/layout/AppShell'
import { AssistantPage } from './pages/AssistantPage'
import { AuditHistoryPage } from './pages/AuditHistoryPage'
import { DashboardPage } from './pages/DashboardPage'
import { DocumentCenter } from './pages/DocumentCenter'
import { HomePage } from './pages/HomePage'
import { InvestigationDetailPage } from './pages/InvestigationDetailPage'
import { InvestigationsPage } from './pages/InvestigationsPage'
import { InvoicesPage } from './pages/InvoicesPage'
import { KnowledgeAskPage } from './pages/KnowledgeAskPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { ReconciliationWorkspace } from './pages/ReconciliationWorkspace'
import { ReviewsPage } from './pages/ReviewsPage'
import { ReviewDetailPage } from './pages/ReviewDetailPage'
import { SettingsPage } from './pages/SettingsPage'
import { TransactionsPage } from './pages/TransactionsPage'

function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="assistant" element={<AssistantPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="documents" element={<DocumentCenter />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="reconciliation" element={<ReconciliationWorkspace />} />
        <Route path="investigations" element={<InvestigationsPage />} />
        <Route path="investigations/:id" element={<InvestigationDetailPage />} />
        <Route path="reviews" element={<ReviewsPage />} />
        <Route path="reviews/:id" element={<ReviewDetailPage />} />
        <Route path="audit" element={<AuditHistoryPage />} />
        <Route path="knowledge" element={<KnowledgeAskPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route
          path="*"
          element={
            <PlaceholderPage
              title="Page not found"
              description="The requested route does not exist."
            />
          }
        />
      </Route>
    </Routes>
  )
}

export default App
