import { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  ScrollView,
} from 'react-native';
import { getSessionSummary } from '../services/attendance';

export default function ProjectorScreen({ sessionId, user, onBack, onSignOut }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [errorStatus, setErrorStatus] = useState(null);
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (isRefresh = false) => {
    if (!sessionId) {
      setError('No attendance session specified');
      setErrorStatus(404);
      setLoading(false);
      return;
    }

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    setErrorStatus(null);

    try {
      const summaryData = await getSessionSummary(sessionId);
      setData(summaryData);
    } catch (err) {
      setError(err.message || 'Failed to load classroom projector view');
      setErrorStatus(err.status || 500);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Loading classroom projector...</Text>
      </View>
    );
  }

  if (errorStatus === 403) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.errorCard}>
          <Text style={styles.errorIcon}>🚫</Text>
          <Text style={styles.errorCardTitle}>Inaccessible Session</Text>
          <Text style={styles.errorCardMessage}>
            {error || 'Access denied: only assigned teacher can view classroom projector'}
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={onBack}>
            <Text style={styles.primaryButtonText}>← Back to Dashboard</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (errorStatus === 404 || !sessionId) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.errorCard}>
          <Text style={styles.errorIcon}>🔍</Text>
          <Text style={styles.errorCardTitle}>Session Not Found</Text>
          <Text style={styles.errorCardMessage}>
            {error || 'The requested attendance session does not exist.'}
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={onBack}>
            <Text style={styles.primaryButtonText}>← Back to Dashboard</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.errorCard}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorCardTitle}>Display Error</Text>
          <Text style={styles.errorCardMessage}>{error}</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.primaryButton} onPress={() => loadData(false)}>
              <Text style={styles.primaryButtonText}>↻ Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={onBack}>
              <Text style={styles.secondaryButtonText}>Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  const isClosed = data?.session?.status === 'closed';
  const period = data?.period || {};
  const summary = data?.summary || { totalEnrolled: 0, checkedInCount: 0, absentCount: 0, percentage: 0 };
  const qr = data?.qr;

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <View style={styles.projectorFrame}>
        {/* Top Navbar */}
        <View style={styles.navBar}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>{"← Dashboard"}</Text>
          </TouchableOpacity>

          <View style={styles.navCenter}>
            <View style={[styles.statusBadge, isClosed ? styles.statusBadgeClosed : styles.statusBadgeOpen]}>
              <Text style={[styles.statusBadgeText, isClosed ? styles.statusBadgeTextClosed : styles.statusBadgeTextOpen]}>
                {isClosed ? '🔒 Check-In Closed' : '● Check-In Open'}
              </Text>
            </View>
          </View>

          <View style={styles.navRight}>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={() => loadData(true)}
              disabled={refreshing}
            >
              <Text style={styles.refreshButtonText}>
                {refreshing ? '...' : '↻ Refresh'}
              </Text>
            </TouchableOpacity>
            {onSignOut ? (
              <TouchableOpacity style={styles.signOutButton} onPress={onSignOut}>
                <Text style={styles.signOutButtonText}>Sign Out</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Classroom Header */}
        <View style={styles.headerArea}>
          <Text style={styles.classroomTitle}>Classroom Projector</Text>
          <Text style={styles.subjectTitle}>{period.subject || 'Class Session'}</Text>
          <Text style={styles.periodMeta}>
            {period.sectionName} • {period.teacherName} • {period.date} ({period.formattedTime})
          </Text>
        </View>

        {/* Main Display Area */}
        {isClosed ? (
          <View style={styles.closedCard}>
            <Text style={styles.closedIcon}>🔒</Text>
            <Text style={styles.closedTitle}>Attendance Check-In Closed</Text>
            <Text style={styles.closedMessage}>
              The QR code has expired and the session is finalized. Check-in is no longer accepted.
            </Text>
            <View style={styles.finalStatsBox}>
              <Text style={styles.finalStatsTitle}>Final Attendance Summary</Text>
              <Text style={styles.finalStatsText}>
                {summary.checkedInCount} Present • {summary.absentCount} Absent
              </Text>
              <Text style={styles.finalPercentageText}>{summary.percentage}% Attendance Rate</Text>
            </View>
          </View>
        ) : (
          <View style={styles.qrDisplayCard}>
            <View style={styles.qrWrapper}>
              {qr?.qrDataUrl ? (
                <Image
                  source={{ uri: qr.qrDataUrl }}
                  style={styles.qrImage}
                  resizeMode="contain"
                  accessibilityLabel="Classroom Projector QR Code"
                />
              ) : (
                <View style={styles.qrFallbackBox}>
                  <ActivityIndicator size="large" color="#2563eb" />
                  <Text style={styles.qrFallbackText}>Loading QR code...</Text>
                </View>
              )}
            </View>

            <Text style={styles.scanInstruction}>
              Scan with your student mobile app to check in
            </Text>

            {qr?.expiresInSeconds !== undefined ? (
              <View style={styles.timerBadge}>
                <Text style={styles.timerText}>
                  Code active • Refreshing automatically
                </Text>
              </View>
            ) : null}

            {/* Attendance Progress Summary (no individual student names) */}
            <View style={styles.summaryBarArea}>
              <View style={styles.summaryBarHeader}>
                <Text style={styles.summaryBarLabel}>Checked In</Text>
                <Text style={styles.summaryBarValue}>
                  {summary.checkedInCount} / {summary.totalEnrolled} ({summary.percentage}%)
                </Text>
              </View>
              <View style={styles.progressBarTrack}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${Math.min(100, Math.max(0, summary.percentage))}%` },
                  ]}
                />
              </View>
            </View>
          </View>
        )}

        <View style={styles.footerRow}>
          <Text style={styles.footerNote}>
            {user ? `Signed in as ${user.name} (${user.email})` : ''}
          </Text>
          <Text style={styles.privacyNote}>
            🛡️ Privacy Protected: Individual student names and attendance details are omitted from this display.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    width: '100%',
    minHeight: '100%',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    width: '100%',
  },
  loadingText: {
    marginTop: 14,
    fontSize: 16,
    color: '#475569',
    fontWeight: '500',
  },
  errorCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    maxWidth: 440,
    width: '100%',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 3,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorCardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorCardMessage: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  projectorFrame: {
    width: '100%',
    maxWidth: 680,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 4,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    marginBottom: 16,
  },
  backButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  backButtonText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '600',
  },
  navCenter: {
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusBadgeOpen: {
    backgroundColor: '#dcfce7',
  },
  statusBadgeClosed: {
    backgroundColor: '#f1f5f9',
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  statusBadgeTextOpen: {
    color: '#15803d',
  },
  statusBadgeTextClosed: {
    color: '#64748b',
  },
  navRight: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  refreshButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#eff6ff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  refreshButtonText: {
    color: '#2563eb',
    fontSize: 13,
    fontWeight: '600',
  },
  signOutButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#fee2e2',
    borderRadius: 6,
  },
  signOutButtonText: {
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '600',
  },
  headerArea: {
    alignItems: 'center',
    marginBottom: 20,
  },
  classroomTitle: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  subjectTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 6,
  },
  periodMeta: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    fontWeight: '500',
  },
  qrDisplayCard: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
  },
  qrWrapper: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
    marginBottom: 16,
  },
  qrImage: {
    width: 320,
    height: 320,
  },
  qrFallbackBox: {
    width: 320,
    height: 320,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrFallbackText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
  },
  scanInstruction: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    textAlign: 'center',
    marginBottom: 8,
  },
  timerBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 16,
  },
  timerText: {
    fontSize: 12,
    color: '#2563eb',
    fontWeight: '500',
  },
  summaryBarArea: {
    width: '100%',
    maxWidth: 420,
    marginTop: 8,
  },
  summaryBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  summaryBarLabel: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
  },
  summaryBarValue: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '700',
  },
  progressBarTrack: {
    height: 10,
    backgroundColor: '#e2e8f0',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#16a34a',
    borderRadius: 5,
  },
  closedCard: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 36,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
  },
  closedIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  closedTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 8,
    textAlign: 'center',
  },
  closedMessage: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    maxWidth: 440,
    lineHeight: 22,
    marginBottom: 20,
  },
  finalStatsBox: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
  },
  finalStatsTitle: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  finalStatsText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 2,
  },
  finalPercentageText: {
    fontSize: 13,
    color: '#16a34a',
    fontWeight: '600',
  },
  footerRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  footerNote: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 4,
  },
  privacyNote: {
    fontSize: 11,
    color: '#64748b',
    lineHeight: 16,
  },
});
