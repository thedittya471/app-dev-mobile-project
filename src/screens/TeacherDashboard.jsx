import { useEffect, useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Image,
  Platform,
} from 'react-native';
import { getPeriodById } from '../services/schedule';
import useSchedule from '../hooks/useSchedule';
import useQrCountdown from '../hooks/useQrCountdown';
import {
  openAttendanceSession,
  getSessionQrCode,
  getAttendanceSession,
  closeAttendanceSession,
  updateAttendanceRecord,
} from '../services/attendance';

export default function TeacherDashboard({ user, onSignOut, onOpenProjector }) {
  const [selectedDate, setSelectedDate] = useState('today');
  const { scheduleData, loading, error, refresh: refreshSchedule } = useSchedule(selectedDate);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [activeSessionData, setActiveSessionData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [closeLoading, setCloseLoading] = useState(false);
  const [updatingStudentId, setUpdatingStudentId] = useState(null);
  const [detailError, setDetailError] = useState(null);
  const [sessionError, setSessionError] = useState(null);
  const [rowError, setRowError] = useState(null);
  const [qrData, setQrData] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState(null);
  const activeSessionId = activeSessionData?.session?.id;
  const isSessionOpen = activeSessionData?.session?.status === 'open';
  const countdown = useQrCountdown(isSessionOpen && qrData?.sessionId === activeSessionId ? qrData : null);
  const qrRequest = useRef(false);
  const rosterRequest = useRef(false);
  const rosterVersion = useRef(0);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterRefreshing, setRosterRefreshing] = useState(false);
  const [rosterError, setRosterError] = useState(null);

  const loadQrCode = useCallback(async (sessionId) => {
    if (!sessionId || qrRequest.current) return;
    qrRequest.current = true;
    setQrLoading(true);
    setQrError(null);
    try {
      const codeResult = await getSessionQrCode(sessionId);
      setQrData({ ...codeResult, receivedAt: Date.now() });
    } catch (err) {
      setQrError(err.message || 'Failed to fetch QR code');
    } finally {
      qrRequest.current = false;
      setQrLoading(false);
    }
  }, []);

  const loadRoster = useCallback(async (sessionId, isBackground = false) => {
    if (!sessionId || rosterRequest.current) return;
    rosterRequest.current = true;
    const version = rosterVersion.current;
    if (!isBackground) {
      setRosterLoading(true);
    } else {
      setRosterRefreshing(true);
    }
    setRosterError(null);
    try {
      const data = await getAttendanceSession(sessionId);
      if (version !== rosterVersion.current) return;
      setActiveSessionData((prev) => {
        if (prev?.session?.id !== sessionId) return prev;
        return {
          ...prev,
          session: data.session,
          roster: data.roster,
          summary: data.summary,
        };
      });
    } catch (err) {
      if (version === rosterVersion.current) {
        setRosterError(err.message || 'Failed to load attendance roster');
      }
    } finally {
      rosterRequest.current = false;
      setRosterLoading(false);
      setRosterRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!isSessionOpen || countdown > 0) return;
    const timer = setInterval(() => loadQrCode(activeSessionId), 1000);
    return () => clearInterval(timer);
  }, [activeSessionId, isSessionOpen, countdown, loadQrCode]);

  useEffect(() => {
    if (!isSessionOpen || closeLoading || updatingStudentId) return;
    const timer = setInterval(() => loadRoster(activeSessionId, true), 3000);
    return () => clearInterval(timer);
  }, [activeSessionId, isSessionOpen, closeLoading, updatingStudentId, loadRoster]);

  async function handleOpenPeriod(periodId) {
    rosterVersion.current += 1;
    setDetailLoading(true);
    setDetailError(null);
    setActiveSessionData(null);
    setSessionError(null);
    setQrData(null);
    setQrError(null);
    try {
      const period = await getPeriodById(periodId);
      setSelectedPeriod(period);
      if (period.session) {
        // If session already exists, load it
        try {
          const sessionResult = await getAttendanceSession(period.session.id);
          setActiveSessionData(sessionResult);
        } catch (err) {
          setSessionError(err.message);
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

  async function handleCloseSession() {
    if (!activeSessionData?.session?.id) return;
    rosterVersion.current += 1;
    setCloseLoading(true);
    setSessionError(null);
    try {
      const result = await closeAttendanceSession(activeSessionData.session.id);
      setActiveSessionData(result);
      setQrData(null);
      } catch (err) {
      setSessionError(err.message || 'Failed to close attendance session');
    } finally {
      setCloseLoading(false);
    }
  }

  async function handleToggleStudentStatus(studentId, currentStatus) {
    if (!activeSessionData?.session?.id) return;
    const targetStatus = currentStatus === 'present' ? 'absent' : 'present';
    rosterVersion.current += 1;
    setUpdatingStudentId(studentId);
    setRowError(null);
    try {
      const result = await updateAttendanceRecord(activeSessionData.session.id, {
        studentId,
        status: targetStatus,
      });
      setActiveSessionData((prev) => ({
        ...prev,
        roster: result.roster,
        summary: result.summary,
      }));
    } catch (err) {
      setRowError(err.message || 'Failed to update student attendance');
    } finally {
      setUpdatingStudentId(null);
    }
  }

  function handleBackToTimetable() {
    rosterVersion.current += 1;
    setSelectedPeriod(null);
    setActiveSessionData(null);
    setQrData(null);
    setQrError(null);
    setRosterError(null);
    setRowError(null);
    setUpdatingStudentId(null);
    setDetailError(null);
    setSessionError(null);
    refreshSchedule();
  }

  const isClosed = activeSessionData?.session?.status === 'closed';
  const roster = activeSessionData?.roster ?? [];
  const totalEnrolled = roster.length;
  const checkedInCount = roster.filter((student) => student.status === 'present').length;
  const absentCount = roster.filter((student) => student.status === 'absent').length;
  const pendingCount = roster.filter((student) => student.status === 'pending').length;
  const percentage = totalEnrolled ? Math.round((checkedInCount / totalEnrolled) * 100) : 0;
  const isUpdatingSession = closeLoading || !!updatingStudentId;
  const hasActiveQr = qrData?.sessionId === activeSessionId && countdown > 0;

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.identity}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Teacher Portal</Text>
            </View>
            <Text accessibilityRole="header" style={styles.greeting}>{user.name}</Text>
            <Text style={styles.email}>{user.email}</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" style={styles.signOutButton} onPress={onSignOut}>
            <Text style={styles.signOutButtonText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {selectedPeriod ? (
          <View style={styles.detailContainer}>
            <TouchableOpacity accessibilityRole="button"
              style={styles.backButton}
              onPress={handleBackToTimetable}
              disabled={sessionLoading || isUpdatingSession || detailLoading}
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
                  <View style={[styles.sessionBox, isClosed && styles.sessionBoxClosed]}>
                    {sessionError ? (
                      <View style={styles.errorBox}>
                        <Text style={styles.errorText}>{sessionError}</Text>
                      </View>
                    ) : null}

                    <View style={styles.sessionStatusRow}>
                      <View style={[styles.statusPill, isClosed && styles.statusPillClosed]}>
                        <Text style={styles.statusPillText}>
                          {isClosed ? 'CLOSED (FINALIZED)' : 'OPEN'}
                        </Text>
                      </View>
                      <Text style={[styles.sessionMetaText, isClosed && styles.sessionMetaTextClosed]}>
                        {isClosed
                          ? `Closed: ${new Date(activeSessionData.session.closedAt).toLocaleTimeString('en-IN', { timeZone: selectedPeriod.timezone, hour: '2-digit', minute: '2-digit', hour12: true })}`
                          : `Opened: ${new Date(activeSessionData.session.openedAt).toLocaleTimeString('en-IN', { timeZone: selectedPeriod.timezone, hour: '2-digit', minute: '2-digit', hour12: true })}`}
                      </Text>
                    </View>

                    {onOpenProjector ? (
                      <TouchableOpacity accessibilityRole="button"
                        style={styles.projectorLaunchButton}
                        onPress={() => onOpenProjector(activeSessionData.session.id)}
                      >
                        <Text style={styles.projectorLaunchButtonText}>
                          Open Projector View
                        </Text>
                      </TouchableOpacity>
                    ) : null}

                    {!isClosed ? (
                      <View style={styles.sessionActions}>
                        <TouchableOpacity accessibilityRole="button"
                          style={[styles.closeSessionButton, closeLoading && styles.buttonDisabled]}
                          onPress={handleCloseSession}
                          disabled={isUpdatingSession}
                        >
                          {closeLoading ? (
                            <ActivityIndicator color="#ffffff" />
                          ) : (
                            <Text style={styles.closeSessionButtonText}>
                              Close Session & Finalize Absences
                            </Text>
                          )}
                        </TouchableOpacity>
                        <Text style={styles.closeHint}>
                          Pending students are marked absent when check-in closes.
                        </Text>
                      </View>
                    ) : null}

                    {isClosed ? (
                      <View style={styles.closedBannerBox}>
                        <Text style={styles.closedBannerTitle}>✓ Session Finalized</Text>
                        <Text style={styles.closedBannerSubtitle}>
                          Check-in is closed and unconfirmed students were recorded as absent.
                        </Text>
                      </View>
                    ) : null}

                    <View style={styles.rosterSectionHeader}>
                      <View style={styles.rosterHeading}>
                        <Text accessibilityRole="header" style={styles.rosterTitle}>
                          Attendance roster ({totalEnrolled})
                        </Text>
                        <Text style={styles.rosterSummaryText}>
                          {isClosed
                            ? `Finalized: ${checkedInCount} Present, ${absentCount} Absent (${percentage}%)`
                            : `Checked In: ${checkedInCount} of ${totalEnrolled} (${percentage}%)`}
                        </Text>
                      </View>
                      {!isClosed ? (
                        <TouchableOpacity accessibilityRole="button"
                          style={styles.rosterRefreshButton}
                          onPress={() => loadRoster(activeSessionData.session.id, false)}
                          disabled={rosterLoading || rosterRefreshing}
                        >
                          {rosterRefreshing ? (
                            <ActivityIndicator size="small" color="#166534" />
                          ) : (
                            <Text style={styles.rosterRefreshButtonText}>↻ Refresh</Text>
                          )}
                        </TouchableOpacity>
                      ) : null}
                    </View>

                    <View style={styles.progressBarContainer}>
                      <View
                        style={[
                          styles.progressBarFill,
                          {
                            width: `${percentage}%`,
                          },
                        ]}
                      />
                    </View>

                    <View style={styles.summaryPillRow}>
                      <View style={styles.presentCountPill}>
                        <Text style={styles.presentCountText}>
                          ✓ {checkedInCount} Present
                        </Text>
                      </View>
                      {isClosed ? (
                        <View style={styles.absentCountPill}>
                          <Text style={styles.absentCountText}>
                            ✕ {absentCount} Absent
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.pendingCountPill}>
                          <Text style={styles.pendingCountText}>
                            ⏳ {pendingCount} Pending
                          </Text>
                        </View>
                      )}
                    </View>

                    {rowError ? (
                      <View style={styles.rosterErrorBox}>
                        <Text style={styles.rosterErrorText}>{rowError}</Text>
                      </View>
                    ) : null}

                    {rosterLoading ? (
                      <View style={styles.rosterLoadingBox}>
                        <ActivityIndicator size="small" color="#166534" />
                        <Text style={styles.rosterLoadingText}>Loading roster...</Text>
                      </View>
                    ) : rosterError ? (
                      <View style={styles.rosterErrorBox}>
                        <Text style={styles.rosterErrorText}>{rosterError}</Text>
                        <TouchableOpacity accessibilityRole="button"
                          style={styles.rosterRetryButton}
                          onPress={() => loadRoster(activeSessionData.session.id, false)}
                        >
                          <Text style={styles.rosterRetryButtonText}>Retry Roster</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.rosterList}>
                        {activeSessionData.roster.map((s) => {
                          const isPresent = s.status === 'present';
                          const isAbsent = s.status === 'absent';
                          const isUpdating = updatingStudentId === s.studentId;
                          const initials = (s.studentName || 'Student').split(' ').map((n) => n[0]).slice(0, 2).join('');
                          return (
                            <View
                              key={s.id || s.studentId}
                              style={[
                                styles.rosterRow,
                                isPresent && styles.rosterRowPresent,
                                isAbsent && styles.rosterRowAbsent,
                              ]}
                            >
                              <View style={styles.rosterAvatarCircle}>
                                <Text style={styles.rosterAvatarText}>{initials}</Text>
                              </View>
                              <View style={styles.rosterStudentInfo}>
                                <Text style={styles.studentName}>{s.studentName}</Text>
                                <Text numberOfLines={1} style={styles.studentEmail}>{s.studentEmail}</Text>
                              </View>
                              <View style={styles.rosterActionCol}>
                                <View
                                  style={[
                                    styles.rosterStatusPill,
                                    isPresent
                                      ? styles.rosterStatusPillPresent
                                      : isAbsent
                                      ? styles.rosterStatusPillAbsent
                                      : styles.rosterStatusPillPending,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.rosterStatusText,
                                      isPresent
                                        ? styles.rosterStatusTextPresent
                                        : isAbsent
                                        ? styles.rosterStatusTextAbsent
                                        : styles.rosterStatusTextPending,
                                    ]}
                                  >
                                    {isPresent ? '✓ Present' : isAbsent ? '✕ Absent' : '⏳ Pending'}
                                  </Text>
                                </View>

                                <TouchableOpacity accessibilityRole="button"
                                  style={[
                                    styles.correctButton,
                                    isPresent ? styles.correctButtonAbsent : styles.correctButtonPresent,
                                    isUpdating && styles.buttonDisabled,
                                  ]}
                                  onPress={() => handleToggleStudentStatus(s.studentId, s.status)}
                                  disabled={isUpdatingSession}
                                >
                                  {isUpdating ? (
                                    <ActivityIndicator size="small" color="#ffffff" />
                                  ) : (
                                    <Text style={styles.correctButtonText}>
                                      {isPresent ? 'Mark Absent' : 'Mark Present'}
                                    </Text>
                                  )}
                                </TouchableOpacity>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {!isClosed ? (
                      <View>
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
                            Open Scan QR in the student app.
                          </Text>

                          {!qrError && !hasActiveQr ? (
                            <View style={styles.qrPlaceholder}>
                              <ActivityIndicator size="large" color="#16a34a" />
                              <Text style={styles.qrLoadingText}>Generating QR code...</Text>
                            </View>
                          ) : qrError ? (
                            <View style={styles.qrErrorBox}>
                              <Text style={styles.qrErrorText}>{qrError}</Text>
                              <TouchableOpacity accessibilityRole="button"
                                style={styles.qrRetryButton}
                                onPress={() => loadQrCode(activeSessionData.session.id)}
                              >
                                <Text style={styles.qrRetryText}>Retry QR Code</Text>
                              </TouchableOpacity>
                            </View>
                          ) : hasActiveQr ? (
                            <View style={styles.qrContentBox}>
                              <Image
                                source={{ uri: qrData.qrDataUrl }}
                                style={styles.qrImage}
                                resizeMode="contain"
                                accessibilityLabel="Classroom QR Code"
                              />
                              <View style={styles.qrFooterRow}>
                                <Text style={styles.qrCodeText}>Manual check-in payload</Text>
                                <Text selectable style={styles.qrPayload}>{qrData.qrPayload}</Text>
                                <TouchableOpacity accessibilityRole="button"
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
                    ) : null}
                  </View>
              ) : (
                <View>
                  {sessionError ? (
                    <View style={styles.errorBox}>
                      <Text style={styles.errorText}>{sessionError}</Text>
                    </View>
                  ) : null}

                  <TouchableOpacity accessibilityRole="button"
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
                    Opens check-in for students enrolled in this class.
                  </Text>
                </View>
              )}
            </View>
          </View>
        ) : (
          <View>
            <View style={styles.dateSelector}>
              <TouchableOpacity accessibilityRole="button"
                style={[
                  styles.dateTab,
                  selectedDate === 'today' && styles.dateTabActive,
                ]}
                accessibilityState={{ selected: selectedDate === 'today' }}
                aria-pressed={selectedDate === 'today'}
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
              <TouchableOpacity accessibilityRole="button"
                style={[
                  styles.dateTab,
                  selectedDate === 'tomorrow' && styles.dateTabActive,
                ]}
                accessibilityState={{ selected: selectedDate === 'tomorrow' }}
                aria-pressed={selectedDate === 'tomorrow'}
                onPress={() => setSelectedDate('tomorrow')}
              >
                <Text
                  style={[
                    styles.dateTabText,
                    selectedDate === 'tomorrow' && styles.dateTabTextActive,
                  ]}
                >
                  Tomorrow
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.timezoneBanner}>
              <Text style={styles.timezoneValue}>
                {scheduleData.scheduleDate ? `${scheduleData.scheduleDate} · ${scheduleData.institutionTimezone}` : 'Institution calendar'}
              </Text>
            </View>

            <Text accessibilityRole="header" style={styles.sectionTitle}>Assigned classes</Text>

            {detailLoading ? (
              <View style={styles.stateBox}>
                <ActivityIndicator size="small" color="#5ab9fc" />
                <Text style={styles.stateText}>Loading period details...</Text>
              </View>
            ) : detailError ? (
              <View style={[styles.stateBox, styles.errorBox]}>
                <Text style={styles.errorText}>{detailError}</Text>
                <TouchableOpacity accessibilityRole="button"
                  style={styles.retryButton}
                  onPress={handleBackToTimetable}
                >
                  <Text style={styles.retryButtonText}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            ) : loading ? (
              <View style={styles.stateBox}>
                <ActivityIndicator size="small" color="#5ab9fc" />
                <Text style={styles.stateText}>Loading timetable...</Text>
              </View>
            ) : error ? (
              <View style={[styles.stateBox, styles.errorBox]}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity accessibilityRole="button"
                  style={styles.retryButton}
                  onPress={refreshSchedule}
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
                <TouchableOpacity accessibilityRole="button"
                  style={styles.refreshButton}
                  onPress={refreshSchedule}
                >
                  <Text style={styles.refreshButtonText}>Refresh</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.classList}>
                {scheduleData.schedule.map((item) => (
                  <TouchableOpacity accessibilityRole="button"
                    key={item.id}
                    style={styles.classItem}
                    onPress={() => handleOpenPeriod(item.id)}
                    disabled={detailLoading}
                  >
                    <View style={styles.classDetails}>
                      <Text style={styles.classTime}>{item.formattedTime}</Text>
                      <Text style={styles.classSubject}>{item.subject}</Text>
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
    paddingVertical: 24,
    paddingHorizontal: 12,
    alignItems: 'center',
    width: '100%',
  },
  card: {
    width: '100%',
    maxWidth: 850,
    padding: 16,
    backgroundColor: '#131824',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1f2738',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    gap: 10,
  },
  identity: { flexShrink: 1 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(90, 185, 252, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(90, 185, 252, 0.25)',
    marginBottom: 8,
  },
  badgeText: {
    color: '#5ab9fc',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  greeting: {
    fontSize: 22,
    fontWeight: '800',
    color: '#f1f5f9',
    letterSpacing: -0.4,
  },
  email: {
    fontSize: 12,
    color: '#8e9cb2',
    marginTop: 2,
  },
  signOutButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#1a2030',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#253046',
  },
  signOutButtonText: {
    fontSize: 12,
    color: '#8e9cb2',
    fontWeight: '600',
  },
  dateSelector: {
    flexDirection: 'row',
    backgroundColor: '#0f1420',
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1f2738',
  },
  dateTab: {
    minHeight: 44,
    justifyContent: 'center',
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  dateTabActive: {
    backgroundColor: '#5ab9fc',
  },
  dateTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8e9cb2',
  },
  dateTabTextActive: {
    color: '#0a0d14',
    fontWeight: '800',
  },
  timezoneBanner: {
    backgroundColor: '#0f1420',
    borderWidth: 1,
    borderColor: '#1f2738',
    borderRadius: 10,
    padding: 12,
    marginBottom: 18,
  },
  timezoneValue: {
    fontSize: 12,
    color: '#f1f5f9',
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  stateBox: {
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f1420',
    borderWidth: 1,
    borderColor: '#1f2738',
  },
  stateText: {
    marginTop: 10,
    fontSize: 13,
    color: '#8e9cb2',
  },
  errorBox: {
    backgroundColor: '#381418',
    borderColor: '#ef4444',
    padding: 14,
    borderRadius: 10,
    marginBottom: 12,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '500',
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    backgroundColor: '#ef4444',
    borderRadius: 8,
    marginTop: 10,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyBox: {
    backgroundColor: '#0f1420',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#8e9cb2',
    textAlign: 'center',
    marginBottom: 14,
    lineHeight: 18,
  },
  refreshButton: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    backgroundColor: '#1a2030',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#253046',
  },
  refreshButtonText: {
    fontSize: 12,
    color: '#f1f5f9',
    fontWeight: '600',
  },
  classList: {
    gap: 10,
  },
  classItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#0f1420',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1f2738',
  },
  classDetails: {
    flex: 1,
  },
  classSubject: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 2,
  },
  classTime: {
    fontSize: 12,
    color: '#5ab9fc',
    fontWeight: '600',
    marginBottom: 2,
  },
  classMeta: {
    fontSize: 12,
    color: '#8e9cb2',
  },
  arrowText: {
    fontSize: 18,
    color: '#627289',
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
    fontSize: 13,
    color: '#5ab9fc',
    fontWeight: '700',
  },
  detailCard: {
    padding: 18,
    backgroundColor: '#0f1420',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1f2738',
  },
  detailSubject: {
    fontSize: 20,
    fontWeight: '800',
    color: '#f1f5f9',
    marginBottom: 4,
  },
  detailSection: {
    fontSize: 14,
    color: '#8e9cb2',
    fontWeight: '500',
    marginBottom: 6,
  },
  detailTime: {
    fontSize: 14,
    color: '#5ab9fc',
    fontWeight: '700',
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#1f2738',
  },
  metaLabel: {
    fontSize: 12,
    color: '#8e9cb2',
  },
  metaValue: {
    fontSize: 12,
    color: '#f1f5f9',
    fontWeight: '600',
  },
  attendanceButton: {
    marginTop: 20,
    backgroundColor: '#34d399',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    shadowColor: '#34d399',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 3,
  },
  buttonDisabled: {
    backgroundColor: '#0c2e22',
  },
  attendanceButtonText: {
    color: '#0a0d14',
    fontSize: 14,
    fontWeight: '800',
  },
  attendanceHint: {
    marginTop: 8,
    fontSize: 11,
    color: '#627289',
    textAlign: 'center',
    lineHeight: 16,
  },
  sessionBox: {
    marginTop: 18,
    padding: 16,
    backgroundColor: '#0b201a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#10b981',
  },
  sessionStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusPill: {
    backgroundColor: '#34d399',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusPillText: {
    color: '#0a0d14',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  sessionMetaText: {
    fontSize: 12,
    color: '#34d399',
    fontWeight: '600',
  },
  rosterSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  rosterHeading: { flex: 1, minWidth: 0, marginRight: 8 },
  rosterTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  rosterSummaryText: {
    fontSize: 12,
    color: '#34d399',
    fontWeight: '600',
    marginTop: 2,
  },
  rosterRefreshButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#0b2e23',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#10b981',
  },
  rosterRefreshButtonText: {
    fontSize: 11,
    color: '#34d399',
    fontWeight: '700',
  },
  progressBarContainer: {
    height: 6,
    width: '100%',
    backgroundColor: '#1a2030',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#34d399',
    borderRadius: 3,
  },
  summaryPillRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  presentCountPill: {
    backgroundColor: '#0b2e23',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#10b981',
  },
  presentCountText: {
    fontSize: 11,
    color: '#34d399',
    fontWeight: '700',
  },
  pendingCountPill: {
    backgroundColor: '#38260b',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d97706',
  },
  pendingCountText: {
    fontSize: 11,
    color: '#fbbf24',
    fontWeight: '700',
  },
  rosterLoadingBox: {
    padding: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  rosterLoadingText: {
    fontSize: 12,
    color: '#34d399',
  },
  rosterErrorBox: {
    padding: 12,
    backgroundColor: '#381418',
    borderRadius: 8,
    marginBottom: 10,
    alignItems: 'center',
  },
  rosterErrorText: {
    color: '#fca5a5',
    fontSize: 12,
    marginBottom: 6,
  },
  rosterRetryButton: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  rosterRetryButtonText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
  rosterList: {
    gap: 8,
    marginBottom: 14,
  },
  rosterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#0f1420',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1f2738',
  },
  rosterRowPresent: {
    borderColor: '#10b981',
    backgroundColor: '#0b2e2340',
  },
  rosterAvatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1a2030',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#253046',
  },
  rosterAvatarText: {
    color: '#5ab9fc',
    fontSize: 12,
    fontWeight: '700',
  },
  rosterStudentInfo: {
    flex: 1,
  },
  rosterActionCol: {
    alignItems: 'flex-end',
    gap: 6,
  },
  correctButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  correctButtonPresent: {
    backgroundColor: '#34d399',
  },
  correctButtonAbsent: {
    backgroundColor: '#ef4444',
  },
  correctButtonText: {
    color: '#0a0d14',
    fontSize: 10,
    fontWeight: '800',
  },
  studentName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  studentEmail: {
    fontSize: 11,
    color: '#8e9cb2',
    marginTop: 1,
  },
  rosterStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  rosterStatusPillPresent: {
    backgroundColor: '#0b2e23',
    borderColor: '#10b981',
    borderWidth: 1,
  },
  rosterStatusPillPending: {
    backgroundColor: '#38260b',
    borderColor: '#d97706',
    borderWidth: 1,
  },
  rosterStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  rosterStatusTextPresent: {
    color: '#34d399',
    fontWeight: '700',
  },
  rosterStatusTextPending: {
    color: '#fbbf24',
  },
  qrCard: {
    backgroundColor: '#0f1420',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1f2738',
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
    color: '#f1f5f9',
  },
  qrSubtitle: {
    fontSize: 12,
    color: '#8e9cb2',
    width: '100%',
    marginBottom: 12,
  },
  timerBadge: {
    backgroundColor: '#0b2e23',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#10b981',
  },
  timerBadgeExpiring: {
    backgroundColor: '#381418',
    borderColor: '#ef4444',
  },
  timerText: {
    color: '#34d399',
    fontSize: 11,
    fontWeight: '700',
  },
  timerTextExpiring: {
    color: '#f87171',
  },
  qrPlaceholder: {
    height: 220,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrLoadingText: {
    marginTop: 8,
    fontSize: 12,
    color: '#8e9cb2',
  },
  qrErrorBox: {
    padding: 12,
    alignItems: 'center',
  },
  qrErrorText: {
    color: '#fca5a5',
    fontSize: 13,
    marginBottom: 8,
  },
  qrRetryButton: {
    backgroundColor: '#5ab9fc',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  qrRetryText: {
    color: '#0a0d14',
    fontSize: 12,
    fontWeight: '700',
  },
  qrContentBox: {
    alignItems: 'center',
    width: '100%',
  },
  qrImage: {
    width: '100%',
    maxWidth: 240,
    aspectRatio: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 8,
  },
  qrFooterRow: {
    gap: 8,
    alignItems: 'flex-start',
    width: '100%',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1f2738',
  },
  qrCodeText: {
    fontSize: 11,
    color: '#5ab9fc',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  qrPayload: {
    width: '100%',
    color: '#dce7f4',
    fontSize: 12,
    ...Platform.select({ web: { overflowWrap: 'anywhere' } }),
  },
  qrRefreshButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#1a2030',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#253046',
  },
  qrRefreshButtonText: {
    fontSize: 11,
    color: '#f1f5f9',
    fontWeight: '600',
  },
  sessionBoxClosed: {
    backgroundColor: '#0f1420',
    borderColor: '#1f2738',
  },
  statusPillClosed: {
    backgroundColor: '#253046',
  },
  sessionMetaTextClosed: {
    color: '#8e9cb2',
  },
  closedBannerBox: {
    backgroundColor: '#1a2030',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#253046',
  },
  closedBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 2,
  },
  closedBannerSubtitle: {
    fontSize: 12,
    color: '#8e9cb2',
    lineHeight: 16,
  },
  absentCountPill: {
    backgroundColor: '#381418',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  absentCountText: {
    fontSize: 11,
    color: '#f87171',
    fontWeight: '700',
  },
  rosterRowAbsent: {
    borderColor: '#ef4444',
    backgroundColor: '#38141840',
  },
  rosterStatusPillAbsent: {
    backgroundColor: '#381418',
    borderColor: '#ef4444',
    borderWidth: 1,
  },
  rosterStatusTextAbsent: {
    color: '#f87171',
  },
  sessionActions: { marginBottom: 16 },
  closeSessionButton: {
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: '#ef4444',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 6,
  },
  closeSessionButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  closeHint: {
    fontSize: 11,
    color: '#627289',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 16,
  },
  projectorLaunchButton: {
    backgroundColor: '#102235',
    borderWidth: 1,
    borderColor: '#5ab9fc',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 14,
  },
  projectorLaunchButtonText: {
    color: '#5ab9fc',
    fontSize: 13,
    fontWeight: '700',
  },
});
