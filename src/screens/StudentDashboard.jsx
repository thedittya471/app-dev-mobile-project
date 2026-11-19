import { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { getSchedule } from '../services/schedule';

export default function StudentDashboard({ user, onSignOut }) {
  const [scheduleData, setScheduleData] = useState({
    schedule: [],
    institutionDate: '',
    institutionTimezone: '',
  });
  const [selectedDate, setSelectedDate] = useState('today');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadSchedule = useCallback(async (dateParam) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSchedule(dateParam);
      setScheduleData(data);
    } catch (err) {
      setError(err.message || 'Failed to load classes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSchedule(selectedDate);
  }, [loadSchedule, selectedDate]);

  function handleSelectDate(dateKey) {
    setSelectedDate(dateKey);
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Student Portal</Text>
            </View>
            <Text style={styles.greeting}>{user.name}</Text>
            <Text style={styles.email}>{user.email}</Text>
          </View>
          <TouchableOpacity style={styles.signOutButton} onPress={onSignOut}>
            <Text style={styles.signOutButtonText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.dateSelector}>
          <TouchableOpacity
            style={[styles.dateTab, selectedDate === 'today' && styles.dateTabActive]}
            onPress={() => handleSelectDate('today')}
          >
            <Text
              style={[
                styles.dateTabText,
                selectedDate === 'today' && styles.dateTabTextActive,
              ]}
            >
              Today
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dateTab, selectedDate === '2026-11-20' && styles.dateTabActive]}
            onPress={() => handleSelectDate('2026-11-20')}
          >
            <Text
              style={[
                styles.dateTabText,
                selectedDate === '2026-11-20' && styles.dateTabTextActive,
              ]}
            >
              Empty Day
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.timezoneBanner}>
          <Text style={styles.timezoneLabel}>Institution Date & Timezone:</Text>
          <Text style={styles.timezoneValue}>
            {scheduleData.institutionDate || 'Loading...'} ({scheduleData.institutionTimezone || 'America/New_York'})
          </Text>
        </View>

        <Text style={styles.sectionTitle}>{"Today's Classes"}</Text>

        {loading ? (
          <View style={styles.stateBox}>
            <ActivityIndicator size="small" color="#2563eb" />
            <Text style={styles.stateText}>Loading classes...</Text>
          </View>
        ) : error ? (
          <View style={[styles.stateBox, styles.errorBox]}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => loadSchedule(selectedDate)}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : scheduleData.schedule.length === 0 ? (
          <View style={[styles.stateBox, styles.emptyBox]}>
            <Text style={styles.emptyTitle}>No Classes Scheduled</Text>
            <Text style={styles.emptySubtitle}>
              There are no classes scheduled for this date in the institution calendar.
            </Text>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={() => loadSchedule(selectedDate)}
            >
              <Text style={styles.refreshButtonText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.classList}>
            {scheduleData.schedule.map((item, index) => (
              <View key={item.id} style={styles.classItem}>
                <View style={styles.classIndex}>
                  <Text style={styles.classIndexText}>{index + 1}</Text>
                </View>
                <View style={styles.classDetails}>
                  <Text style={styles.classSubject}>{item.subject}</Text>
                  <Text style={styles.classTime}>{item.formattedTime}</Text>
                  <Text style={styles.classMeta}>
                    {item.teacherName} • {item.sectionName}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    paddingVertical: 16,
    alignItems: 'center',
    width: '100%',
  },
  card: {
    width: '100%',
    maxWidth: 440,
    padding: 20,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
  },
  badgeText: {
    color: '#1e40af',
    fontWeight: '700',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  greeting: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  email: {
    fontSize: 13,
    color: '#64748b',
  },
  signOutButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  signOutButtonText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
  },
  dateSelector: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 3,
    marginBottom: 12,
  },
  dateTab: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 6,
  },
  dateTabActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  dateTabText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748b',
  },
  dateTabTextActive: {
    color: '#0f172a',
    fontWeight: '600',
  },
  timezoneBanner: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
  },
  timezoneLabel: {
    fontSize: 11,
    color: '#64748b',
    textTransform: 'uppercase',
    fontWeight: '600',
    marginBottom: 2,
  },
  timezoneValue: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 12,
  },
  stateBox: {
    padding: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  stateText: {
    marginTop: 8,
    fontSize: 13,
    color: '#64748b',
  },
  errorBox: {
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 10,
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#b91c1c',
    borderRadius: 6,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyBox: {
    backgroundColor: '#f8fafc',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 18,
  },
  refreshButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#e2e8f0',
    borderRadius: 6,
  },
  refreshButtonText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  classList: {
    gap: 10,
  },
  classItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  classIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  classIndexText: {
    color: '#2563eb',
    fontWeight: '700',
    fontSize: 13,
  },
  classDetails: {
    flex: 1,
  },
  classSubject: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 2,
  },
  classTime: {
    fontSize: 13,
    color: '#2563eb',
    fontWeight: '500',
    marginBottom: 2,
  },
  classMeta: {
    fontSize: 12,
    color: '#64748b',
  },
});
