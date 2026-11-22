import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { getCurrentUser, signOut } from './src/services/auth';
import SignInScreen from './src/screens/SignInScreen';
import TeacherDashboard from './src/screens/TeacherDashboard';
import StudentDashboard from './src/screens/StudentDashboard';
import ProjectorScreen from './src/screens/ProjectorScreen';

function parseBrowserRoute() {
  if (typeof window === 'undefined' || !window.location) {
    return { route: 'home', sessionId: null };
  }

  const pathname = window.location.pathname || '';
  const search = window.location.search || '';
  const hash = window.location.hash || '';

  const searchParams = new URLSearchParams(search);
  const routeParam = searchParams.get('route');
  const sessionParam = searchParams.get('sessionId');

  // Match /projector/:sessionId or /projector
  const projectorPathMatch = pathname.match(/^\/projector(?:\/([a-f0-9-]+))?$/i);
  if (projectorPathMatch) {
    return {
      route: 'projector',
      sessionId: projectorPathMatch[1] || sessionParam,
    };
  }

  // Match /sessions/:sessionId/projector
  const sessionProjectorMatch = pathname.match(/^\/sessions\/([a-f0-9-]+)\/projector$/i);
  if (sessionProjectorMatch) {
    return {
      route: 'projector',
      sessionId: sessionProjectorMatch[1],
    };
  }

  // Match hash #/projector/:sessionId
  const hashMatch = hash.match(/^#\/?projector(?:\/([a-f0-9-]+))?$/i);
  if (hashMatch) {
    return {
      route: 'projector',
      sessionId: hashMatch[1] || sessionParam,
    };
  }

  if (routeParam === 'projector' || (sessionParam && pathname.includes('projector'))) {
    return {
      route: 'projector',
      sessionId: sessionParam,
    };
  }

  return { route: 'home', sessionId: null };
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [routeInfo, setRouteInfo] = useState(() => parseBrowserRoute());

  useEffect(() => {
    function handleLocationChange() {
      setRouteInfo(parseBrowserRoute());
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', handleLocationChange);
      return () => window.removeEventListener('popstate', handleLocationChange);
    }
  }, []);

  function navigateTo(route, sessionId = null) {
    if (typeof window !== 'undefined') {
      const url = route === 'projector' && sessionId
        ? `/projector?sessionId=${encodeURIComponent(sessionId)}`
        : '/';
      window.history.pushState({}, '', url);
    }
    setRouteInfo({ route, sessionId });
  }

  useEffect(() => {
    async function initAuth() {
      try {
        const currentUser = await getCurrentUser();
        setUser(currentUser);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    initAuth();
  }, []);

  async function handleSignOut() {
    setLoading(true);
    await signOut();
    setUser(null);
    setLoading(false);
  }

  function renderContent() {
    if (loading) {
      return <ActivityIndicator size="large" color="#2563eb" />;
    }

    if (!user) {
      return <SignInScreen onSignInSuccess={(loggedInUser) => setUser(loggedInUser)} />;
    }

    if (routeInfo.route === 'projector') {
      return (
        <ProjectorScreen
          sessionId={routeInfo.sessionId}
          user={user}
          onBack={() => navigateTo('home')}
          onSignOut={handleSignOut}
        />
      );
    }

    if (user.role === 'teacher') {
      return (
        <TeacherDashboard
          user={user}
          onSignOut={handleSignOut}
          onOpenProjector={(sessionId) => navigateTo('projector', sessionId)}
        />
      );
    }

    return <StudentDashboard user={user} onSignOut={handleSignOut} />;
  }

  return (
    <View style={styles.container}>
      {renderContent()}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
});
