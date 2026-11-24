import { AppProvider, useApp } from './context/AppContext';
import { AuthScreen } from './components/AuthScreen';
import { DashboardView } from './components/DashboardView';
import { GradeInputView } from './components/GradeInputView';
import { HomeroomView } from './components/HomeroomView';
import { LayoutShell } from './components/LayoutShell';
import { MasterDataView } from './components/MasterDataView';
import { ReportCardView } from './components/ReportCardView';

function MainRouter() {
  const { currentUser, activeTab } = useApp();

  if (!currentUser) {
    return <AuthScreen />;
  }

  const isGuru = currentUser.role === 'guru';

  return (
    <LayoutShell>
      {activeTab === 'dashboard' && <DashboardView />}
      {activeTab === 'input_nilai' && <GradeInputView />}
      {activeTab === 'wali_kelas' && (!isGuru ? <HomeroomView /> : <GradeInputView />)}
      {activeTab === 'raport' && (!isGuru ? <ReportCardView /> : <GradeInputView />)}
      {activeTab === 'master_data' && (currentUser.role === 'admin' ? <MasterDataView /> : <DashboardView />)}
    </LayoutShell>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainRouter />
    </AppProvider>
  );
}
