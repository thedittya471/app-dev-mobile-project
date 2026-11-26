import { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { signIn } from '../services/auth';

const showTestAccounts = __DEV__ && process.env.EXPO_PUBLIC_SHOW_TEST_ACCOUNTS === 'true';
const testAccounts = [
  { label: 'Sample teacher', email: 'teacher@pilot.edu' },
  { label: 'Sample student', email: 'student1@pilot.edu' },
];

export default function SignInScreen({ initialError, onSignInSuccess }) {
  const { width } = useWindowDimensions();
  const wide = width >= 800;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);

  async function handleSignIn(address = email, secret = password) {
    if (loading) return;
    if (!address.trim() || !secret) {
      setError('Enter your institutional email and password.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      onSignInSuccess(await signIn(address, secret));
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={[styles.layout, wide && styles.layoutWide]}>
        <View style={[styles.intro, wide && styles.introWide]}>
          <Text style={styles.brand}>CampusPulse</Text>
          <Text accessibilityRole="header" style={[styles.title, wide && styles.titleWide]}>
            Attendance and daily planning
          </Text>
          <Text style={styles.description}>
            Check in to class, review attendance, and find study activities that fit your timetable.
          </Text>
        </View>

        <View style={[styles.form, wide && styles.formWide]}>
          <Text accessibilityRole="header" style={styles.formTitle}>Sign in</Text>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

          <View style={styles.field}>
            <Text style={styles.label}>Institutional email</Text>
            <TextInput
              accessibilityLabel="Institutional email"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              keyboardType="email-address"
              editable={!loading}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              accessibilityLabel="Password"
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              autoComplete="current-password"
              secureTextEntry
              editable={!loading}
              returnKeyType="go"
              onSubmitEditing={() => handleSignIn()}
            />
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ busy: loading, disabled: loading }}
            style={[styles.submit, loading && styles.disabled]}
            onPress={() => handleSignIn()}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#102033" /> : <Text style={styles.submitText}>Sign in</Text>}
          </TouchableOpacity>

          {showTestAccounts ? (
            <View style={styles.testAccounts}>
              <Text style={styles.testLabel}>Local test database</Text>
              <View style={styles.testButtons}>
                {testAccounts.map((account) => (
                  <TouchableOpacity
                    accessibilityRole="button"
                    key={account.email}
                    onPress={() => handleSignIn(account.email, 'password123')}
                    disabled={loading}
                    style={styles.testButton}
                  >
                    <Text style={styles.testButtonText}>{account.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 36,
  },
  layout: { width: '100%', maxWidth: 460, gap: 28 },
  layoutWide: { maxWidth: 960, flexDirection: 'row', alignItems: 'center', gap: 72 },
  intro: { paddingHorizontal: 4, gap: 12 },
  introWide: { flex: 1, paddingHorizontal: 0, gap: 18 },
  brand: { color: '#83cef9', fontSize: 15, fontWeight: '800' },
  title: { color: '#f1f5f9', fontSize: 32, lineHeight: 37, fontWeight: '800', letterSpacing: -0.8 },
  titleWide: { fontSize: 51, lineHeight: 55, letterSpacing: -1.5 },
  description: { color: '#a9bad0', fontSize: 16, lineHeight: 24, maxWidth: 370 },
  form: { gap: 18, padding: 22, backgroundColor: '#131824', borderColor: '#29364b', borderWidth: 1, borderRadius: 16 },
  formWide: { width: 402, padding: 30 },
  formTitle: { color: '#f1f5f9', fontSize: 24, fontWeight: '700' },
  field: { gap: 7 },
  label: { color: '#dce7f4', fontSize: 14, fontWeight: '600' },
  input: {
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#f1f5f9',
    backgroundColor: '#0d1320',
    borderColor: '#42536d',
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 16,
  },
  error: { color: '#ffc3c5', backgroundColor: '#381418', borderRadius: 8, padding: 10, fontSize: 14, lineHeight: 20 },
  submit: { minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 8, backgroundColor: '#83cef9' },
  submitText: { color: '#102033', fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.65 },
  testAccounts: { borderTopWidth: 1, borderColor: '#29364b', paddingTop: 16, gap: 8 },
  testLabel: { color: '#a9bad0', fontSize: 13 },
  testButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  testButton: { borderWidth: 1, borderColor: '#42536d', borderRadius: 8, minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  testButtonText: { color: '#dce7f4', fontSize: 13, fontWeight: '600' },
});
