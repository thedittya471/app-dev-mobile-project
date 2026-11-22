import { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Image,
} from 'react-native';
import { getSchedule, getPeriodById } from '../services/schedule';
import { openAttendanceSession, getSessionQrCode } from '../services/attendance';

export default function TeacherDashboard({ user, onSignOut }) {
  const [scheduleData, setScheduleData] = useState({
    schedule: [],
    institutionDate: '',
    institutionTimezone: '',
  });
  const [selectedDate, setSelectedDate] = useState('today');
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [activeSessionData, setActiveSessionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [detailError, setDetailError] = useState(null);
  const [sessionError, setSessionError] = useState(null);
  const [qrData, setQrData] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState(null);
  const [countdown, setCountdown] = useState(0);

  const loadSchedule = useCallback(async (dateParam) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSchedule(dateParam);
      setScheduleData(data);
    } catch (err) {
      setError(err.message || 'Failed to load timetable');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadQrCode = useCallback(async (sessionId) => {
    if (!sessionId) return;
    setQrLoading(true);
    setQrError(null);
    try {
      const codeResult = await getSessionQrCode(sessionId);
      setQrData(codeResult);
      setCountdown(codeResult.expiresInSeconds);
    } catch (err) {
      setQrError(err.message || 'Failed to fetch QR code');
    } finally {
      setQrLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSchedule(selectedDate);
  }, [loadSchedule, selectedDate]);

  useEffect(() => {
    if (activeSessionData?.session?.id && activeSessionData?.session?.status === 'open') {
      loadQrCode(activeSessionData.session.id);
    } else {
      setQrData(null);
      setCountdown(0);
    }
  }, [activeSessionData?.session?.id, activeSessionData?.session?.status, loadQrCode]);

  useEffect(() => {
    if (!activeSessionData?.session?.id || activeSessionData?.session?.status !== 'open') {
      return;
    }

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          loadQrCode(activeSessionData.session.id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeSessionData?.session?.id, activeSessionData?.session?.status, loadQrCode]);

  async function handleOpenPeriod(periodId) {
    setDetailLoading(true);
    setDetailError(null);
    setActiveSessionData(null);
    setSessionError(null);
    setQrData(null);
    setQrError(null);
    setCountdown(0);
    try {
      const period = await getPeriodById(periodId);
      setSelectedPeriod(period);
      if (period.session) {
        // If session already exists, load it
        try {
          const sessionResult = await openAttendanceSession(periodId);
          setActiveSessionData(sessionResult);
        } catch {
          // Keep period view even if session load fails
        }
      }
    } catch (err) {
      setDetailError(err.message || 'Inaccessible or missing period');
      setSelectedPeriod(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleStartSession() {
    if (!selectedPeriod) return;
    setSessionLoading(true);
    setSessionError(null);
    try {
      const result = await openAttendanceSession(selectedPeriod.id);
      setActiveSessionData(result);
    } catch (err) {
      setSessionError(err.message || 'Failed to start session');
    } finally {
      setSessionLoading(false);
    }
  }

  function handleBackToTimetable() {
    setSelectedPeriod(null);
    setActiveSessionData(null);
    setQrData(null);
    setQrError(null);
    setCountdown(0);
    setDetailError(null);
    setSessionError(null);
    loadSchedule(selectedDate);
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Teacher Portal</Text>
            </View>
            <Text style={styles.greeting}>{user.name}</Text>
            <Text style={styles.email}>{user.email}</Text>
          </View>
          <TouchableOpacity style={styles.signOutButton} onPress={onSignOut}>
            <Text style={styles.signOutButtonText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {selectedPeriod ? (
          <View style={styles.detailContainer}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={handleBackToTimetable}
            >
              <Text style={styles.backButtonText}>{"← Back to Timetable"}</Text>
            </TouchableOpacity>

            <View style={styles.detailCard}>
              <Text style={styles.detailSubject}>{selectedPeriod.subject}</Text>
              <Text style={styles.detailSection}>{selectedPeriod.sectionName}</Text>
              <Text style={styles.detailTime}>{selectedPeriod.formattedTime}</Text>

              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Date:</Text>
                <Text style={styles.metaValue}>{selectedPeriod.periodDate}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Timezone:</Text>
                <Text style={styles.metaValue}>{selectedPeriod.timezone}</Text>
              </View>

              {activeSessionData ? (
                <View style={styles.sessionBox}>
                  <View style={styles.sessionStatusRow}>
                    <View style={styles.statusPill}>
                      <Text style={styles.statusPillText}>
                        {activeSessionData.session.status.toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.sessionMetaText}>
                      Opened: {new Date(activeSessionData.session.openedAt).toLocaleTimeString()}
                    </Text>
                  </View>

                  <Text style={styles.rosterTitle}>
                    Roster Snapshot ({activeSessionData.roster.length} students)
                  </Text>
                  <View style={styles.rosterList}>
                    {activeSessionData.roster.map((s) => (
                      <View key={s.id} style={styles.rosterRow}>
                        <View>
                          <Text style={styles.studentName}>{s.studentName}</Text>
                          <Text style={styles.studentEmail}>{s.studentEmail}</Text>
                        </View>
                        <View style={styles.rosterStatusPill}>
                          <Text style={styles.rosterStatusText}>{s.status}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                  <View style={styles.qrCard}>
                    <View style={styles.qrHeaderRow}>
                      <Text style={styles.qrTitle}>Classroom Check-In QR</Text>
                      {countdown > 0 ? (
                        <View style={[styles.timerBadge, countdown <= 5 && styles.timerBadgeExpiring]}>
                          <Text style={[styles.timerText, countdown <= 5 && styles.timerTextExpiring]}>
                            {qrLoading ? 'Refreshing...' : `Expires in ${countdown}s`}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <Text style={styles.qrSubtitle}>
                      Scan with student mobile app to record attendance
                    </Text>

                    {qrLoading && !qrData ? (
                      <View style={styles.qrPlaceholder}>
                        <ActivityIndicator size="large" color="#16a34a" />
                        <Text style={styles.qrLoadingText}>Generating QR code...</Text>
                      </View>
                    ) : qrError ? (
                      <View style={styles.qrErrorBox}>
                        <Text style={styles.qrErrorText}>{qrError}</Text>
                        <TouchableOpacity
                          style={styles.qrRetryButton}
                          onPress={() => loadQrCode(activeSessionData.session.id)}
                        >
                          <Text style={styles.qrRetryText}>Retry QR Code</Text>
                        </TouchableOpacity>
                      </View>
                    ) : qrData ? (
                      <View style={styles.qrContentBox}>
                        <Image
                          source={{ uri: qrData.qrDataUrl }}
                          style={styles.qrImage}
                          resizeMode="contain"
                          accessibilityLabel="Classroom QR Code"
                        />
                        <View style={styles.qrFooterRow}>
                          <Text style={styles.qrCodeText}>
                            Active Code: {qrData.code.substring(0, 8)}...
                          </Text>
                          <TouchableOpacity
                            style={styles.qrRefreshButton}
                            onPress={() => loadQrCode(activeSessionData.session.id)}
                            disabled={qrLoading}
                          >
                            <Text style={styles.qrRefreshButtonText}>
                              {qrLoading ? '...' : '↻ Refresh'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : null}
                  </View>
                </View>
              ) : (
                <View>
                  {sessionError ? (
                    <View style={styles.errorBox}>
                      <Text style={styles.errorText}>{sessionError}</Text>
                    </View>
                  ) : null}

                  <TouchableOpacity
                    style={[styles.attendanceButton, sessionLoading && styles.buttonDisabled]}
                    onPress={handleStartSession}
                    disabled={sessionLoading}
                  >
                    {sessionLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.attendanceButtonText}>
                        Start Attendance Session
                      </Text>
                    )}
                  </TouchableOpacity>
                  <Text style={styles.attendanceHint}>
                    Captures roster snapshot and creates at most one session per period.
                  </Text>
                </View>
              )}
            </View>
          </View>
        ) : (
          <View>
            <View style={styles.dateSelector}>
              <TouchableOpacity
                style={[
                  styles.dateTab,
                  selectedDate === 'today' && styles.dateTabActive,
                ]}
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
                style={[
                  styles.dateTab,
                  selectedDate === '2026-11-20' && styles.dateTabActive,
                ]}
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

            <Text style={styles.sectionTitle}>Assigned Classes</Text>

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
                <Text style={styles.stateText}>Loading timetable...</Text>
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
                <Text style={styles.emptyTitle}>No Classes Assigned</Text>
                <Text style={styles.emptySubtitle}>
                  You have no classes scheduled for this date.
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
                      <Text style={styles.classMeta}>{item.sectionName}</Text>
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
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
  },
  badgeText: {
    color: '#92400e',
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
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#b91c1c',
    borderRadius: 6,
    marginTop: 8,
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
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  classIndexText: {
    color: '#92400e',
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
  attendanceButton: {
    marginTop: 20,
    backgroundColor: '#16a34a',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#86efac',
  },
  attendanceButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  attendanceHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 16,
  },
  sessionBox: {
    marginTop: 18,
    padding: 14,
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  sessionStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusPill: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusPillText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  sessionMetaText: {
    fontSize: 12,
    color: '#15803d',
  },
  rosterTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#166534',
    marginBottom: 8,
  },
  rosterList: {
    gap: 6,
    marginBottom: 10,
  },
  rosterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#ffffff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#dcfce7',
  },
  studentName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  studentEmail: {
    fontSize: 11,
    color: '#64748b',
  },
  rosterStatusPill: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  rosterStatusText: {
    color: '#92400e',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  qrCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    alignItems: 'center',
  },
  qrHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 4,
  },
  qrTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#166534',
  },
  qrSubtitle: {
    fontSize: 12,
    color: '#64748b',
    width: '100%',
    marginBottom: 12,
  },
  timerBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  timerBadgeExpiring: {
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
  },
  timerText: {
    color: '#15803d',
    fontSize: 11,
    fontWeight: '700',
  },
  timerTextExpiring: {
    color: '#b91c1c',
  },
  qrPlaceholder: {
    height: 220,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrLoadingText: {
    marginTop: 8,
    fontSize: 12,
    color: '#64748b',
  },
  qrErrorBox: {
    padding: 12,
    alignItems: 'center',
  },
  qrErrorText: {
    color: '#b91c1c',
    fontSize: 13,
    marginBottom: 8,
  },
  qrRetryButton: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  qrRetryText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  qrContentBox: {
    alignItems: 'center',
    width: '100%',
  },
  qrImage: {
    width: 220,
    height: 220,
    backgroundColor: '#ffffff',
    borderRadius: 6,
  },
  qrFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  qrCodeText: {
    fontSize: 11,
    color: '#64748b',
    fontFamily: 'monospace',
  },
  qrRefreshButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#f1f5f9',
    borderRadius: 4,
  },
  qrRefreshButtonText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '600',
  },
});
