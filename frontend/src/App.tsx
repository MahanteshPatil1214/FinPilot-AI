import { Navigate, Route, Routes } from 'react-router-dom'

import { AppShell } from './components/layout/AppShell'
import { DocumentCenter } from './pages/DocumentCenter'
import { InvoicesPage } from './pages/InvoicesPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { ReconciliationWorkspace } from './pages/ReconciliationWorkspace'
import { TransactionsPage } from './pages/TransactionsPage'

function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/reconciliation" replace />} />
        <Route
          path="dashboard"
          element={
            <PlaceholderPage
              title="Dashboard"
              description="Reconciliation and investigation metrics."
            />
          }
        />
        <Route path="documents" element={<DocumentCenter />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="reconciliation" element={<ReconciliationWorkspace />} />
        <Route
          path="investigations"
          element={
            <PlaceholderPage
              title="Investigations"
              description="Agent steps, tool results, retrieved evidence and citations."
            />
          }
        />
        <Route
          path="reviews"
          element={
            <PlaceholderPage
              title="Report review"
              description="Approve, reject or request more information on investigation reports."
            />
          }
        />
        <Route
          path="audit"
          element={
            <PlaceholderPage
              title="Audit history"
              description="Append-only record of reviews and status changes."
            />
          }
        />
        <Route
          path="settings"
          element={
            <PlaceholderPage
              title="Settings"
              description="Safe configuration. API keys are never displayed."
            />
          }
        />
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
