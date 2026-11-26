import { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { getSessionSummary } from '../services/attendance';
import useQrCountdown from '../hooks/useQrCountdown';

export default function ProjectorScreen({ sessionId, onBack, onSignOut }) {
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useRef(null);
  const { width } = useWindowDimensions();
  const countdown = useQrCountdown(data?.qr);

  useEffect(() => {
    if (!sessionId) return;
    const controller = new AbortController();
    let busy = false;
    let timer;

    async function poll(manual = false) {
      if (busy) return;
      busy = true;
      clearTimeout(timer);
      if (manual) setRefreshing(true);
      try {
        const result = await getSessionSummary(sessionId, controller.signal);
        if (controller.signal.aborted) return;
        setData({
          ...result,
          qr: result.qr && { ...result.qr, receivedAt: Date.now() },
        });
        setError(null);
        if (result.session.status === 'open') timer = setTimeout(poll, 3000);
      } catch (error) {
        if (controller.signal.aborted) return;
        setError(error);
        if (![401, 403, 404].includes(error.status)) timer = setTimeout(poll, 3000);
      } finally {
        busy = false;
        if (manual && !controller.signal.aborted) setRefreshing(false);
      }
    }

    refresh.current = () => poll(true);
    poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
      refresh.current = null;
    };
  }, [sessionId]);

  const loading = sessionId && !data && !error;
  const errorStatus = error?.status;
  const networkInterrupted = !!error;
  const loadData = () => refresh.current?.();

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#5ab9fc" />
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
            {error?.message || 'Access denied: only assigned teacher can view classroom projector'}
          </Text>
          <TouchableOpacity accessibilityRole="button" style={styles.primaryButton} onPress={onBack}>
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
            {error?.message || 'The requested attendance session does not exist.'}
          </Text>
          <TouchableOpacity accessibilityRole="button" style={styles.primaryButton} onPress={onBack}>
            <Text style={styles.primaryButtonText}>← Back to Dashboard</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (error && (!data || errorStatus === 401)) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.errorCard}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorCardTitle}>Display Error</Text>
          <Text style={styles.errorCardMessage}>{error.message}</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity accessibilityRole="button" style={styles.primaryButton} onPress={loadData}>
              <Text style={styles.primaryButtonText}>↻ Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" style={styles.secondaryButton} onPress={onBack}>
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
  const isQrExpired = countdown <= 0;
  const wide = width >= 760;
  const qrSize = Math.min(wide ? 340 : 280, Math.max(140, width - 120));
  const qrDimensions = { width: qrSize, height: qrSize };

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <View style={styles.projectorFrame}>
        {/* Top Navbar */}
        <View style={styles.navBar}>
          <TouchableOpacity accessibilityRole="button" style={styles.backButton} onPress={onBack}>
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
            <TouchableOpacity accessibilityRole="button"
              style={styles.refreshButton}
              onPress={loadData}
              disabled={refreshing}
            >
              <Text style={styles.refreshButtonText}>
                {refreshing ? '...' : '↻ Refresh'}
              </Text>
            </TouchableOpacity>
            {onSignOut ? (
              <TouchableOpacity accessibilityRole="button" style={styles.signOutButton} onPress={onSignOut}>
                <Text style={styles.signOutButtonText}>Sign Out</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Network interrupted alert banner */}
        {networkInterrupted ? (
          <View style={styles.interruptedBanner}>
            <ActivityIndicator size="small" color="#fbbf24" />
            <Text style={styles.interruptedBannerText}>
              Updates interrupted. Showing the last received count.
            </Text>
          </View>
        ) : null}

        {/* Classroom Header */}
        <View style={styles.headerArea}>
          <Text style={styles.classroomTitle}>Classroom Projector</Text>
          <Text accessibilityRole="header" style={styles.subjectTitle}>{period.subject || 'Class Session'}</Text>
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
          <View style={[styles.qrDisplayCard, wide && styles.qrDisplayWide]}>
            <View style={styles.qrWrapper}>
              {/* Hide expired QR code if network interrupted or while refreshing */}
              {networkInterrupted && isQrExpired ? (
                <View style={[styles.qrExpiredBox, qrDimensions]}>
                  <Text style={styles.qrExpiredIcon}>⌛</Text>
                  <Text style={styles.qrExpiredTitle}>QR Code Expired</Text>
                  <Text style={styles.qrExpiredText}>
                    Network interrupted. Hiding expired QR while retrying connection...
                  </Text>
                  <ActivityIndicator size="small" color="#fbbf24" style={{ marginTop: 8 }} />
                </View>
              ) : isQrExpired && !networkInterrupted ? (
                <View style={[styles.qrFallbackBox, qrDimensions]}>
                  <ActivityIndicator size="large" color="#5ab9fc" />
                  <Text style={styles.qrFallbackText}>Refreshing QR code...</Text>
                </View>
              ) : qr?.qrDataUrl ? (
                <Image
                  source={{ uri: qr.qrDataUrl }}
                  style={[styles.qrImage, qrDimensions]}
                  resizeMode="contain"
                  accessibilityLabel="Classroom Projector QR Code"
                />
              ) : (
                <View style={[styles.qrFallbackBox, qrDimensions]}>
                  <ActivityIndicator size="large" color="#5ab9fc" />
                  <Text style={styles.qrFallbackText}>Generating QR code...</Text>
                </View>
              )}
            </View>

            <View style={styles.summaryBarArea}>
              <Text style={styles.scanInstruction}>Scan to check in</Text>
              <Text style={styles.scanDetail}>Open Scan QR in the student app.</Text>
              <Text style={[styles.timerText, countdown <= 5 && styles.timerTextExpiring]}>
                {countdown > 0 ? `Code refreshes in ${countdown}s` : 'Waiting for an active code'}
              </Text>
              <Text style={styles.summaryBarValue} accessibilityLiveRegion="polite">
                {summary.checkedInCount} / {summary.totalEnrolled}
              </Text>
              <Text style={styles.summaryBarLabel}>Checked in · {summary.percentage}%</Text>
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

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    width: '100%',
    minHeight: '100%',
    backgroundColor: '#0a0d14',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    width: '100%',
    backgroundColor: '#0a0d14',
  },
  loadingText: {
    marginTop: 14,
    fontSize: 15,
    color: '#8e9cb2',
    fontWeight: '500',
  },
  errorCard: {
    backgroundColor: '#131824',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    maxWidth: 440,
    width: '100%',
    borderWidth: 1,
    borderColor: '#ef4444',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 4,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorCardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#f1f5f9',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorCardMessage: {
    fontSize: 14,
    color: '#8e9cb2',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  primaryButton: {
    backgroundColor: '#5ab9fc',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#0a0d14',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#1a2030',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#253046',
  },
  secondaryButtonText: {
    color: '#8e9cb2',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  projectorFrame: {
    width: '100%',
    maxWidth: 1050,
    backgroundColor: '#131824',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1f2738',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowOffset: { width: 0, height: 16 },
    shadowRadius: 32,
    elevation: 8,
  },
  navBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2738',
    marginBottom: 18,
  },
  backButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#1a2030',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#253046',
  },
  backButtonText: {
    color: '#8e9cb2',
    fontSize: 12,
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
    backgroundColor: '#0b2e23',
    borderWidth: 1,
    borderColor: '#10b981',
  },
  statusBadgeClosed: {
    backgroundColor: '#1a2030',
    borderWidth: 1,
    borderColor: '#253046',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statusBadgeTextOpen: {
    color: '#34d399',
  },
  statusBadgeTextClosed: {
    color: '#8e9cb2',
  },
  navRight: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  refreshButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#1a2030',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#253046',
  },
  refreshButtonText: {
    color: '#5ab9fc',
    fontSize: 12,
    fontWeight: '600',
  },
  signOutButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#381418',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  signOutButtonText: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '600',
  },
  headerArea: {
    alignItems: 'center',
    marginBottom: 20,
  },
  classroomTitle: {
    fontSize: 11,
    color: '#5ab9fc',
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  subjectTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#f1f5f9',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  periodMeta: {
    fontSize: 13,
    color: '#8e9cb2',
    textAlign: 'center',
    fontWeight: '500',
  },
  qrDisplayCard: {
    alignItems: 'center',
    backgroundColor: '#0f1420',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1f2738',
    marginBottom: 16,
  },
  qrDisplayWide: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 40,
  },
  qrWrapper: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 4,
    marginBottom: 16,
  },
  qrImage: {
    width: 300,
    height: 300,
  },
  qrFallbackBox: {
    width: 300,
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrFallbackText: {
    marginTop: 12,
    fontSize: 14,
    color: '#8e9cb2',
  },
  scanInstruction: {
    fontSize: 23,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 4,
  },
  scanDetail: { color: '#a9bad0', marginBottom: 8, fontSize: 15 },
  timerText: {
    fontSize: 12,
    color: '#34d399',
    fontWeight: '700',
  },
  timerTextExpiring: {
    color: '#f87171',
    fontWeight: '700',
  },
  interruptedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#38260b',
    borderWidth: 1,
    borderColor: '#d97706',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  interruptedBannerText: {
    flexShrink: 1,
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '600',
  },
  qrExpiredBox: {
    width: 300,
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#0f1420',
    borderRadius: 14,
  },
  qrExpiredIcon: {
    fontSize: 44,
    marginBottom: 8,
  },
  qrExpiredTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fbbf24',
    marginBottom: 6,
    textAlign: 'center',
  },
  qrExpiredText: {
    fontSize: 13,
    color: '#8e9cb2',
    textAlign: 'center',
    lineHeight: 18,
  },
  summaryBarArea: {
    width: '100%',
    maxWidth: 330,
    marginTop: 8,
  },
  summaryBarLabel: {
    fontSize: 14,
    marginBottom: 8,
    color: '#8e9cb2',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryBarValue: {
    fontSize: 44,
    marginTop: 10,
    color: '#f1f5f9',
    fontWeight: '700',
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#1a2030',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#34d399',
    borderRadius: 4,
  },
  closedCard: {
    alignItems: 'center',
    backgroundColor: '#0f1420',
    borderRadius: 18,
    padding: 36,
    borderWidth: 1,
    borderColor: '#1f2738',
    marginBottom: 16,
  },
  closedIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  closedTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#f1f5f9',
    marginBottom: 8,
    textAlign: 'center',
  },
  closedMessage: {
    fontSize: 14,
    color: '#8e9cb2',
    textAlign: 'center',
    maxWidth: 440,
    lineHeight: 22,
    marginBottom: 20,
  },
  finalStatsBox: {
    backgroundColor: '#1a2030',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#253046',
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
  },
  finalStatsTitle: {
    fontSize: 11,
    color: '#8e9cb2',
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  finalStatsText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 4,
  },
  finalPercentageText: {
    fontSize: 14,
    color: '#34d399',
    fontWeight: '700',
  },
});
