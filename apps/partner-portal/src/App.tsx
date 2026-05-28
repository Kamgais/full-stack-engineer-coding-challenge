import { CircularProgress, CssBaseline, Stack, ThemeProvider } from '@mui/material';
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { ProfilePage } from './pages/ProfilePage';
import { theme } from './theme/theme';
import { PricingCatalogPage } from './pages/PricingCatalogPage';

function RequireAuth({ children }: { children: JSX.Element }): JSX.Element {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <Stack
        sx={{ minHeight: '100vh' }}
        alignItems="center"
        justifyContent="center"
      >
        <CircularProgress />
      </Stack>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export function App(): JSX.Element {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/profile"
              element={
                <RequireAuth>
                  <AppLayout>
                    <ProfilePage />
                  </AppLayout>
                </RequireAuth>
              }
            />
             <Route
              path="/pricing"
              element={
                <RequireAuth>
                  <AppLayout>
                    <PricingCatalogPage />
                  </AppLayout>
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to="/profile" replace />} />
          </Routes>
        </AuthProvider>
      </Router>
    </ThemeProvider>
  );
}
