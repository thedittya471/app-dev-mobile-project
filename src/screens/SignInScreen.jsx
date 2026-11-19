import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { signIn } from '../services/auth';

export default function SignInScreen({ onSignInSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSignIn() {
    if (!email || !password) {
      setErrorMessage('Please enter email and password');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      const user = await signIn(email, password);
      onSignInSuccess(user);
    } catch (err) {
      setErrorMessage(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  }

  function fillCredentials(fillEmail) {
    setEmail(fillEmail);
    setPassword('password123');
    setErrorMessage('');
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Sign In</Text>
      <Text style={styles.subtitle}>Student Attendance & Planner</Text>

      {errorMessage ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        editable={!loading}
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        editable={!loading}
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSignIn}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign In</Text>
        )}
      </TouchableOpacity>

      <View style={styles.demoSection}>
        <Text style={styles.demoLabel}>Quick fill demo accounts:</Text>
        <View style={styles.demoButtons}>
          <TouchableOpacity
            style={styles.demoButton}
            onPress={() => fillCredentials('teacher@pilot.edu')}
            disabled={loading}
          >
            <Text style={styles.demoButtonText}>Teacher</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.demoButton}
            onPress={() => fillCredentials('student1@pilot.edu')}
            disabled={loading}
          >
            <Text style={styles.demoButtonText}>Student</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 360,
    padding: 24,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 20,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
    fontSize: 16,
    color: '#0f172a',
  },
  button: {
    height: 48,
    backgroundColor: '#2563eb',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: '#93c5fd',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  errorBox: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 14,
  },
  demoSection: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 16,
  },
  demoLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 8,
  },
  demoButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  demoButton: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    alignItems: 'center',
  },
  demoButtonText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '500',
  },
});
