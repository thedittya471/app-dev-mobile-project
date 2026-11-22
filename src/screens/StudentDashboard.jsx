import { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { getSchedule, getPeriodById } from '../services/schedule';
import { getStudentAttendance } from '../services/attendance';
import StudentScanScreen from './StudentScanScreen';

export default function StudentDashboard({ user, onSignOut }) {
  const [currentView, setCurrentView] = useState('today');
  const [scheduleData, setScheduleData] = useState({
    schedule: [],
    institutionDate: '',
    institutionTimezone: '',
  });
  const [selectedDate, setSelectedDate] = useState('today');
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(null);
  const [detailError, setDetailError] = useState(null);

  const [attendanceData, setAttendanceData] = useState({
    summary: { totalSessions: 0, presentSessions: 0, absentSessions: 0, percentage: 0 },
    bySubject: [],
    records: [],
  });
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState(null);

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

  const loadAttendance = useCallback(async () => {
    setAttendanceLoading(true);
    setAttendanceError(null);
    try {
      const data = await getStudentAttendance();
      setAttendanceData(data);
    } catch (err) {
      setAttendanceError(err.message || 'Failed to load attendance');
    } finally {
      setAttendanceLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSchedule(selectedDate);
  }, [loadSchedule, selectedDate]);

  useEffect(() => {
    if (currentView === 'attendance') {
      loadAttendance();
    }
  }, [currentView, loadAttendance]);

  async function handleOpenPeriod(periodId) {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const period = await getPeriodById(periodId);
      setSelectedPeriod(period);
    } catch (err) {
      setDetailError(err.message || 'Inaccessible or missing period');
      setSelectedPeriod(null);
    } finally {
      setDetailLoading(false);
    }
  }

  function handleBackToTimetable() {
    setSelectedPeriod(null);
    setDetailError(null);
  }

  if (currentView === 'scan') {
    return (
      <StudentScanScreen
        onBack={() => {
          setCurrentView('today');
          loadSchedule(selectedDate);
          loadAttendance();
        }}
      />
    );
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

        <View style={styles.portalNav}>
          <TouchableOpacity
            style={[styles.portalTab, currentView === 'today' && styles.portalTabActive]}
            onPress={() => setCurrentView('today')}
          >
            <Text
              style={[styles.portalTabText, currentView === 'today' && styles.portalTabTextActive]}
            >
              📅 Today
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.portalTab, currentView === 'attendance' && styles.portalTabActive]}
            onPress={() => setCurrentView('attendance')}
          >
            <Text
              style={[
                styles.portalTabText,
                currentView === 'attendance' && styles.portalTabTextActive,
              ]}
            >
              📊 Attendance
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.portalTab, currentView === 'scan' && styles.portalTabActive]}
            onPress={() => setCurrentView('scan')}
          >
            <Text
              style={[styles.portalTabText, currentView === 'scan' && styles.portalTabTextActive]}
            >
              📷 Scan QR
            </Text>
          </TouchableOpacity>
        </View>

        {currentView === 'attendance' ? (
          <View style={styles.attendanceContainer}>
            <View style={styles.attendanceHeaderRow}>
              <Text style={styles.sectionTitle}>My Attendance</Text>
              <TouchableOpacity
                style={styles.attendanceRefreshBtn}
                onPress={loadAttendance}
                disabled={attendanceLoading}
              >
                <Text style={styles.attendanceRefreshText}>
                  {attendanceLoading ? 'Refreshing...' : '🔄 Refresh'}
                </Text>
              </TouchableOpacity>
            </View>

            {attendanceLoading && !attendanceData.summary.totalSessions ? (
              <View style={styles.stateBox}>
                <ActivityIndicator size="small" color="#2563eb" />
                <Text style={styles.stateText}>Loading attendance records...</Text>
              </View>
            ) : attendanceError ? (
              <View style={[styles.stateBox, styles.errorBox]}>
                <Text style={styles.errorText}>{attendanceError}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={loadAttendance}>
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : attendanceData.summary.totalSessions === 0 ? (
              <View style={[styles.stateBox, styles.emptyBox]}>
                <Text style={styles.emptyIcon}>📊</Text>
                <Text style={styles.emptyTitle}>No Attendance Records</Text>
                <Text style={styles.emptySubtitle}>
                  Finalized attendance records and subject percentages will appear here once teachers close class sessions.
                </Text>
                <TouchableOpacity style={styles.refreshButton} onPress={loadAttendance}>
                  <Text style={styles.refreshButtonText}>Refresh</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                {/* Overall Summary Card */}
                <View style={styles.summaryCard}>
                  <View style={styles.summaryTop}>
                    <Text style={styles.summaryPercentText}>
                      {attendanceData.summary.percentage}%
                    </Text>
                    <Text style={styles.summaryLabel}>Overall Attendance</Text>
                  </View>
                  <View style={styles.progressBarBg}>
                    <View
                      style={[
                        styles.progressBarFill,
                        { width: `${Math.min(100, Math.max(0, attendanceData.summary.percentage))}%` },
                      ]}
                    />
                  </View>
                  <View style={styles.statsRow}>
                    <View style={styles.statCol}>
                      <Text style={styles.statNum}>{attendanceData.summary.totalSessions}</Text>
                      <Text style={styles.statLabel}>Total Classes</Text>
                    </View>
                    <View style={styles.statCol}>
                      <Text style={[styles.statNum, styles.statPresent]}>
                        {attendanceData.summary.presentSessions}
                      </Text>
                      <Text style={styles.statLabel}>Present</Text>
                    </View>
                    <View style={styles.statCol}>
                      <Text style={[styles.statNum, styles.statAbsent]}>
                        {attendanceData.summary.absentSessions}
                      </Text>
                      <Text style={styles.statLabel}>Absent</Text>
                    </View>
                  </View>
                </View>

                {/* By Subject Section */}
                <Text style={styles.subSectionTitle}>Attendance by Subject</Text>
                <View style={styles.subjectList}>
                  {attendanceData.bySubject.map((subj) => (
                    <View key={subj.subject} style={styles.subjectCard}>
                      <View style={styles.subjectTopRow}>
                        <Text style={styles.subjectName}>{subj.subject}</Text>
                        <View
                          style={[
                            styles.subjectBadge,
                            subj.percentage >= 75
                              ? styles.badgeGood
                              : subj.percentage >= 50
                              ? styles.badgeWarning
                              : styles.badgeDanger,
                          ]}
                        >
                          <Text
                            style={[
                              styles.subjectBadgeText,
                              subj.percentage >= 75
                                ? styles.badgeTextGood
                                : subj.percentage >= 50
                                ? styles.badgeTextWarning
                                : styles.badgeTextDanger,
                            ]}
                          >
                            {subj.percentage}%
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.subjectCountsText}>
                        {subj.presentSessions} / {subj.totalSessions} sessions present
                        {subj.absentSessions > 0 ? ` (${subj.absentSessions} absent)` : ''}
                      </Text>
                      <View style={styles.subjectProgressBarBg}>
                        <View
                          style={[
                            styles.subjectProgressBarFill,
                            {
                              width: `${Math.min(100, Math.max(0, subj.percentage))}%`,
                              backgroundColor:
                                subj.percentage >= 75
                                  ? '#16a34a'
                                  : subj.percentage >= 50
                                  ? '#d97706'
                                  : '#dc2626',
                            },
                          ]}
                        />
                      </View>
                    </View>
                  ))}
                </View>

                {/* Recent Sessions List */}
                <Text style={styles.subSectionTitle}>Recent Sessions</Text>
                <View style={styles.recordList}>
                  {attendanceData.records.map((rec) => (
                    <View key={rec.id} style={styles.recordCard}>
                      <View style={styles.recordDetails}>
                        <Text style={styles.recordSubject}>{rec.subject}</Text>
                        <Text style={styles.recordMeta}>
                          {rec.date} • {rec.formattedTime}
                        </Text>
                        <Text style={styles.recordSection}>{rec.sectionName}</Text>
                      </View>
                      <View
                        style={[
                          styles.recordStatusBadge,
                          rec.status === 'present'
                            ? styles.recordStatusPresent
                            : styles.recordStatusAbsent,
                        ]}
                      >
                        <Text
                          style={[
                            styles.recordStatusText,
                            rec.status === 'present'
                              ? styles.recordStatusTextPresent
                              : styles.recordStatusTextAbsent,
                          ]}
                        >
                          {rec.status === 'present' ? '✓ Present' : '✕ Absent'}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        ) : selectedPeriod ? (
          <View style={styles.detailContainer}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={handleBackToTimetable}
            >
              <Text style={styles.backButtonText}>{"← Back to Today"}</Text>
            </TouchableOpacity>

            <View style={styles.detailCard}>
              <Text style={styles.detailSubject}>{selectedPeriod.subject}</Text>
              <Text style={styles.detailSection}>{selectedPeriod.sectionName}</Text>
              <Text style={styles.detailTime}>{selectedPeriod.formattedTime}</Text>

              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Teacher:</Text>
                <Text style={styles.metaValue}>{selectedPeriod.teacherName}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Date:</Text>
                <Text style={styles.metaValue}>{selectedPeriod.periodDate}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Timezone:</Text>
                <Text style={styles.metaValue}>{selectedPeriod.timezone}</Text>
              </View>

              <TouchableOpacity
                style={styles.scanActionButton}
                onPress={() => setCurrentView('scan')}
              >
                <Text style={styles.scanActionButtonText}>📷 Scan Attendance QR</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View>
            <TouchableOpacity
              style={styles.scanBanner}
              onPress={() => setCurrentView('scan')}
            >
              <Text style={styles.scanBannerText}>📷 Scan Classroom Attendance QR</Text>
            </TouchableOpacity>

            <View style={styles.dateSelector}>
              <TouchableOpacity
                style={[styles.dateTab, selectedDate === 'today' && styles.dateTabActive]}
                onPress={() => setSelectedDate('today')}
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
                onPress={() => setSelectedDate('2026-11-20')}
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
                {scheduleData.institutionDate || 'Loading...'} (
                {scheduleData.institutionTimezone || 'America/New_York'})
              </Text>
            </View>

            <Text style={styles.sectionTitle}>{"Today's Classes"}</Text>

            {detailLoading ? (
              <View style={styles.stateBox}>
                <ActivityIndicator size="small" color="#2563eb" />
                <Text style={styles.stateText}>Loading period details...</Text>
              </View>
            ) : detailError ? (
              <View style={[styles.stateBox, styles.errorBox]}>
                <Text style={styles.errorText}>{detailError}</Text>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={handleBackToTimetable}
                >
                  <Text style={styles.retryButtonText}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            ) : loading ? (
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
                  <TouchableOpacity
                    key={item.id}
                    style={styles.classItem}
                    onPress={() => handleOpenPeriod(item.id)}
                  >
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
                    <Text style={styles.arrowText}>{"→"}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
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
  arrowText: {
    fontSize: 18,
    color: '#94a3b8',
    paddingHorizontal: 4,
  },
  detailContainer: {
    marginTop: 4,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 16,
    paddingVertical: 6,
  },
  backButtonText: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '600',
  },
  detailCard: {
    padding: 18,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  detailSubject: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 4,
  },
  detailSection: {
    fontSize: 15,
    color: '#475569',
    fontWeight: '500',
    marginBottom: 8,
  },
  detailTime: {
    fontSize: 15,
    color: '#2563eb',
    fontWeight: '600',
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  metaLabel: {
    fontSize: 13,
    color: '#64748b',
  },
  metaValue: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '500',
  },
  portalNav: {
    flexDirection: 'row',
    marginBottom: 16,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    padding: 3,
  },
  portalTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  portalTabActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  portalTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  portalTabTextActive: {
    color: '#2563eb',
  },
  scanBanner: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginBottom: 14,
  },
  scanBannerText: {
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '700',
  },
  scanActionButton: {
    marginTop: 14,
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  scanActionButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  attendanceContainer: {
    marginTop: 4,
  },
  attendanceHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  attendanceRefreshBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#eff6ff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  attendanceRefreshText: {
    fontSize: 12,
    color: '#2563eb',
    fontWeight: '600',
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 8,
    textAlign: 'center',
  },
  summaryCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    marginBottom: 16,
  },
  summaryTop: {
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryPercentText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  summaryLabel: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '500',
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 14,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#2563eb',
    borderRadius: 4,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 12,
  },
  statCol: {
    alignItems: 'center',
  },
  statNum: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  statPresent: {
    color: '#16a34a',
  },
  statAbsent: {
    color: '#dc2626',
  },
  statLabel: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  subSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
    marginTop: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  subjectList: {
    gap: 8,
    marginBottom: 16,
  },
  subjectCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
  },
  subjectTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  subjectName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  subjectBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  badgeGood: {
    backgroundColor: '#dcfce7',
  },
  badgeWarning: {
    backgroundColor: '#fef3c7',
  },
  badgeDanger: {
    backgroundColor: '#fee2e2',
  },
  subjectBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  badgeTextGood: {
    color: '#16a34a',
  },
  badgeTextWarning: {
    color: '#d97706',
  },
  badgeTextDanger: {
    color: '#dc2626',
  },
  subjectCountsText: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 8,
  },
  subjectProgressBarBg: {
    height: 6,
    backgroundColor: '#f1f5f9',
    borderRadius: 3,
    overflow: 'hidden',
  },
  subjectProgressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  recordList: {
    gap: 8,
  },
  recordCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
  },
  recordDetails: {
    flex: 1,
  },
  recordSubject: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 2,
  },
  recordMeta: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 2,
  },
  recordSection: {
    fontSize: 11,
    color: '#94a3b8',
  },
  recordStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },
  recordStatusPresent: {
    backgroundColor: '#dcfce7',
  },
  recordStatusAbsent: {
    backgroundColor: '#fee2e2',
  },
  recordStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  recordStatusTextPresent: {
    color: '#16a34a',
  },
  recordStatusTextAbsent: {
    color: '#dc2626',
  },
});
