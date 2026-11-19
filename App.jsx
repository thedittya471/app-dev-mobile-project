import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { getCurrentUser, signOut } from './src/services/auth';
import SignInScreen from './src/screens/SignInScreen';
import TeacherDashboard from './src/screens/TeacherDashboard';
import StudentDashboard from './src/screens/StudentDashboard';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

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

    if (user.role === 'teacher') {
      return <TeacherDashboard user={user} onSignOut={handleSignOut} />;
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
