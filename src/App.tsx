import { HashRouter, Route, Routes } from 'react-router-dom'
import AppShell from './layouts/AppShell'
import Toaster from './components/Toaster'
import Login from './pages/Login'
import ChangePassword from './pages/ChangePassword'
import ReviewPage from './pages/ReviewPage'
import Dashboard from './pages/Dashboard'
import ApplicationsList from './pages/ApplicationsList'
import ApplicationWizard from './pages/ApplicationWizard'
import NewApplication from './pages/NewApplication'
import Administration from './pages/Administration'
import { CustomersPage, DecisionsPage, DocumentsPage, ScreeningPage, ValuationsPage } from './pages/queues'
import ErrorDialog from './components/ErrorDialog'
import { ProcessingOverlay } from './components/ui'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/review/:token" element={<ReviewPage />} />
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="applications" element={<ApplicationsList />} />
          <Route path="applications/new" element={<NewApplication />} />
          <Route path="applications/:id/:step" element={<ApplicationWizard />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="screening" element={<ScreeningPage />} />
          <Route path="valuations" element={<ValuationsPage />} />
          <Route path="decisions" element={<DecisionsPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="admin" element={<Administration />} />
          <Route path="*" element={<Dashboard />} />
        </Route>
      </Routes>
      <Toaster />
      <ProcessingOverlay />
      <ErrorDialog />
    </HashRouter>
  )
}
