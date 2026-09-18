import { useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { Principal, Role } from './api/types';
import { useAuth } from './state/auth';
import { NotificationsProvider } from './state/notifications';
import { LoadingScreen } from './components/ui';
import { Intro } from './components/Intro';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { SetPassword } from './pages/SetPassword';
import { Account } from './pages/Account';
import { StudentDashboard } from './pages/StudentDashboard';
import { BrowseStudents } from './pages/BrowseStudents';
import { MyTeam } from './pages/MyTeam';
import { Submissions } from './pages/Submissions';
import { CoordinatorQueue } from './pages/CoordinatorQueue';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminTeams } from './pages/admin/AdminTeams';
import { AdminRoster } from './pages/admin/AdminRoster';
import { AdminSettings } from './pages/admin/AdminSettings';
import { AdminAudit } from './pages/admin/AdminAudit';

const HOME: Record<Role, string> = {
  student: '/',
  project_coordinator: '/review',
  cdc_coordinator: '/review',
  admin: '/admin',
  proctor: '/admin',
};

export function App() {
  const [introDone, setIntroDone] = useState(false);
  return (
    <>
      {!introDone && <Intro onDone={() => setIntroDone(true)} />}
      <AppContent />
    </>
  );
}

function AppContent() {
  const { principal, loading, mustSetPassword } = useAuth();
  if (loading) return <LoadingScreen />;

  // A single Router wraps every state so navigation is always URL-driven and the
  // browser Back/Forward buttons work — including the sign-in flow.
  return (
    <BrowserRouter>
      {!principal ? (
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/login/:role" element={<Login />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      ) : mustSetPassword ? (
        // First student login (one-time hashkey consumed) → gate on a password.
        <SetPassword />
      ) : (
        <AuthedRoutes principal={principal} />
      )}
    </BrowserRouter>
  );
}

function AuthedRoutes({ principal }: { principal: Principal }) {
  const home = HOME[principal.role];
  const isStudent = principal.role === 'student';
  const isCoordinator = principal.role === 'project_coordinator' || principal.role === 'cdc_coordinator';
  const isAdmin = principal.role === 'admin';
  const isOversight = isAdmin || principal.role === 'proctor';

  return (
    <NotificationsProvider>
      <Routes>
        <Route element={<Layout />}>
          {isStudent && (
            <>
              <Route index element={<StudentDashboard />} />
              <Route path="/team" element={<MyTeam />} />
              <Route path="/browse" element={<BrowseStudents />} />
              <Route path="/submissions" element={<Submissions />} />
            </>
          )}
          {isCoordinator && <Route path="/review" element={<CoordinatorQueue />} />}
          {isOversight && (
            <>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/teams" element={<AdminTeams />} />
            </>
          )}
          {isAdmin && (
            <>
              <Route path="/admin/roster" element={<AdminRoster />} />
              <Route path="/admin/settings" element={<AdminSettings />} />
              <Route path="/admin/audit" element={<AdminAudit />} />
            </>
          )}
          {/* Available to every signed-in role. */}
          <Route path="/account" element={<Account />} />
          <Route path="*" element={<Navigate to={home} replace />} />
        </Route>
      </Routes>
    </NotificationsProvider>
  );
}
