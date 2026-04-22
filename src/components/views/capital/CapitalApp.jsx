import React from 'react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { C } from '../../../constants/colors';
import { CapitalNavBridge } from './lib/capitalNav';
import DashboardPage from './pages/DashboardPage';
import IntakePage from './pages/IntakePage';
import PipelinePage from './pages/PipelinePage';
import DealsPage from './pages/DealsPage';
import DealDetailPage from './pages/DealDetailPage';
import NeedsPage from './pages/NeedsPage';
import IntermediariesPage from './pages/IntermediariesPage';
import AgencyRegistryPage from './pages/AgencyRegistryPage';
import CalendarPage from './pages/CalendarPage';
import EmailsPage from './pages/EmailsPage';
import DocumentsPage from './pages/DocumentsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
});

class CapitalErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[Capital]', error, info); }
  reset = () => this.setState({ error: null });
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, textAlign: 'center', color: C.textMid }}>
          <h2 style={{ fontSize: 18, color: C.navy, marginBottom: 8 }}>Capitalモジュールでエラーが発生しました</h2>
          <div style={{ fontSize: 11, color: C.textLight, marginBottom: 16, fontFamily: 'monospace' }}>{this.state.error?.message || 'Unknown error'}</div>
          <button onClick={this.reset} style={{ padding: '6px 16px', fontSize: 12, background: C.navy, color: C.white, border: 'none', borderRadius: 4, cursor: 'pointer' }}>再読み込み</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function CapitalApp() {
  return (
    <CapitalErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <CapitalNavBridge />
          <div style={{ margin: -28, marginTop: 0, marginBottom: 0, minHeight: 'calc(100vh - 120px)' }}>
            <Routes>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/intake" element={<IntakePage />} />
              <Route path="/pipeline" element={<PipelinePage />} />
              <Route path="/deals" element={<DealsPage />} />
              <Route path="/deals/:id" element={<DealDetailPage />} />
              <Route path="/needs" element={<NeedsPage />} />
              <Route path="/firms" element={<IntermediariesPage />} />
              <Route path="/registry" element={<AgencyRegistryPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/emails" element={<EmailsPage />} />
              <Route path="/documents" element={<DocumentsPage />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </div>
        </MemoryRouter>
      </QueryClientProvider>
    </CapitalErrorBoundary>
  );
}
