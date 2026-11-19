import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { API_BASE_URL } from './src/config/api';

export default function App() {
  const [health, setHealth] = useState({ status: 'checking', message: '' });

  useEffect(() => {
    fetch(`${API_BASE_URL}/health`)
      .then(async (res) => {
        const data = await res.json();
        setHealth({
          status: res.ok ? 'connected' : 'error',
          message: JSON.stringify(data),
        });
      })
      .catch((err) => {
        setHealth({ status: 'unreachable', message: err.message });
      });
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Student Attendance & Planner</Text>
      <Text style={styles.subtitle}>API Base: {API_BASE_URL}</Text>
      <Text style={styles.status}>Backend: {health.status}</Text>
      <Text style={styles.detail}>{health.message}</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 16,
    textAlign: 'center',
  },
  status: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  detail: {
    fontSize: 12,
    color: '#888888',
    textAlign: 'center',
  },
});
