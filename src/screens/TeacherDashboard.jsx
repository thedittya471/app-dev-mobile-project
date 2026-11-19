import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';

export default function TeacherDashboard({ user, onSignOut }) {
  return (
    <View style={styles.card}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Teacher Portal</Text>
      </View>
      <Text style={styles.greeting}>Welcome, {user.name}!</Text>
      <Text style={styles.info}>Role: {user.role}</Text>
      <Text style={styles.info}>Email: {user.email}</Text>

      <View style={styles.placeholderBox}>
        <Text style={styles.placeholderTitle}>{"Today's Classes"}</Text>
        <Text style={styles.placeholderText}>
          Timetable and session management will be added in upcoming tasks.
        </Text>
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={onSignOut}>
        <Text style={styles.signOutButtonText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 400,
    padding: 24,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 12,
  },
  badgeText: {
    color: '#92400e',
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  greeting: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 6,
  },
  info: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 4,
  },
  placeholderBox: {
    marginTop: 18,
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  placeholderTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 4,
  },
  placeholderText: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
  },
  signOutButton: {
    height: 44,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  signOutButtonText: {
    color: '#475569',
    fontSize: 15,
    fontWeight: '600',
  },
});
