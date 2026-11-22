import { useState, useRef, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { submitCheckIn } from '../services/attendance';

export default function StudentScanScreen({ onBack }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [submitting, setSubmitting] = useState(false);
  const [successData, setSuccessData] = useState(null);
  const [errorData, setErrorData] = useState(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualPayload, setManualPayload] = useState('');

  // Ref lock to completely suppress repeated camera callbacks while processing
  const isSubmittingRef = useRef(false);

  // Auto-request camera permission on mount
  useEffect(() => {
    if (!permission || !permission.granted) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const processPayload = useCallback(async (rawString) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSubmitting(true);
    setErrorData(null);

    try {
      let parsed;
      try {
        parsed = typeof rawString === 'string' ? JSON.parse(rawString.trim()) : rawString;
      } catch {
        throw new Error('Malformed QR code. Please scan the classroom check-in QR code.');
      }

      if (!parsed || typeof parsed !== 'object' || !parsed.sessionId || !parsed.code) {
        throw new Error('QR code missing session or code information.');
      }

      const result = await submitCheckIn({
        sessionId: parsed.sessionId,
        code: parsed.code,
      });

      // Attendance confirmed by server
      setSuccessData(result);
    } catch (err) {
      const msg = err.message || 'Check-in failed';
      let title = 'Check-in Failed';
      let actionHint = 'Please try scanning again.';

      if (/expired/i.test(msg)) {
        title = 'QR Code Expired';
        actionHint = 'The classroom QR code refreshed. Look at the teacher’s screen and scan the active code.';
      } else if (/network|fetch|failed to fetch|econnrefused/i.test(msg)) {
        title = 'Network Connection Error';
        actionHint = 'Could not reach the server. Please verify your connection and try again.';
      } else if (/not enrolled/i.test(msg)) {
        title = 'Not Enrolled';
        actionHint = 'You are not enrolled in the roster for this class section.';
      } else if (/closed/i.test(msg)) {
        title = 'Session Closed';
        actionHint = 'The attendance session has already been closed by the teacher.';
      }

      setErrorData({
        title,
        message: msg,
        actionHint,
      });
    } finally {
      setSubmitting(false);
    }
  }, []);

  function handleBarcodeScanned({ data }) {
    if (isSubmittingRef.current || submitting || successData || errorData) {
      return;
    }
    processPayload(data);
  }

  function handleRetry() {
    setErrorData(null);
    setSuccessData(null);
    setManualPayload('');
    isSubmittingRef.current = false;
    setSubmitting(false);
  }

  function handleManualSubmit() {
    if (!manualPayload.trim()) return;
    processPayload(manualPayload);
  }

  // 1. Permission Denied State
  if (permission && !permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>{'← Back to Today'}</Text>
          </TouchableOpacity>

          <View style={styles.alertCard}>
            <View style={styles.alertIconCircle}>
              <Text style={styles.alertIconText}>📷</Text>
            </View>
            <Text style={styles.alertTitle}>Camera Access Required</Text>
            <Text style={styles.alertBody}>
              Camera permission is required to scan the classroom attendance QR code displayed by your teacher.
            </Text>

            <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
              <Text style={styles.primaryButtonText}>Grant Camera Permission</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setShowManualInput(!showManualInput)}
            >
              <Text style={styles.secondaryButtonText}>
                {showManualInput ? 'Hide Manual Input' : 'Enter QR Code Manually'}
              </Text>
            </TouchableOpacity>

            {showManualInput ? (
              <View style={styles.manualBox}>
                <Text style={styles.manualLabel}>Paste QR Payload JSON:</Text>
                <TextInput
                  style={styles.manualInput}
                  placeholder='{"sessionId":"...","code":"..."}'
                  placeholderTextColor="#94a3b8"
                  value={manualPayload}
                  onChangeText={setManualPayload}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={[styles.primaryButton, !manualPayload.trim() && styles.buttonDisabled]}
                  onPress={handleManualSubmit}
                  disabled={!manualPayload.trim()}
                >
                  <Text style={styles.primaryButtonText}>Submit Code</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  // 2. Success State
  if (successData) {
    const isRepeat = successData.repeated;
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={styles.successCard}>
            <View style={styles.successIconCircle}>
              <Text style={styles.successCheckText}>✓</Text>
            </View>
            <Text style={styles.successTitle}>
              {isRepeat ? 'Attendance Already Confirmed' : 'Check-In Confirmed!'}
            </Text>
            <Text style={styles.successSubtitle}>
              {isRepeat
                ? 'Your attendance for this session was already recorded.'
                : 'Your attendance has been verified and saved by the server.'}
            </Text>

            <View style={styles.resultDetailsBox}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Status:</Text>
                <View style={styles.presentBadge}>
                  <Text style={styles.presentBadgeText}>
                    {successData.record?.status?.toUpperCase() || 'PRESENT'}
                  </Text>
                </View>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Recorded At:</Text>
                <Text style={styles.detailValue}>
                  {successData.record?.recordedAt
                    ? new Date(successData.record.recordedAt).toLocaleTimeString()
                    : new Date().toLocaleTimeString()}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Method:</Text>
                <Text style={styles.detailValue}>
                  {successData.record?.method || 'QR Scan'}
                </Text>
              </View>
            </View>

            <TouchableOpacity style={styles.primaryButton} onPress={onBack}>
              <Text style={styles.primaryButtonText}>Back to Today</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} onPress={handleRetry}>
              <Text style={styles.secondaryButtonText}>Scan Another Code</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // 3. Error State (Actionable Feedback)
  if (errorData) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>{'← Back to Today'}</Text>
          </TouchableOpacity>

          <View style={styles.errorCard}>
            <View style={styles.errorIconCircle}>
              <Text style={styles.errorIconText}>!</Text>
            </View>
            <Text style={styles.errorTitle}>{errorData.title}</Text>
            <Text style={styles.errorReason}>{errorData.message}</Text>
            <Text style={styles.errorHint}>{errorData.actionHint}</Text>

            <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
              <Text style={styles.retryButtonText}>Try Scanning Again</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} onPress={onBack}>
              <Text style={styles.secondaryButtonText}>Return to Today</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // 4. Active Scanner View
  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>{'← Back to Today'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scan Classroom QR</Text>
        </View>

        <Text style={styles.scannerInstruction}>
          Point camera at the QR code displayed on the teacher’s screen or projector.
        </Text>

        <View style={styles.cameraFrame}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ['qr'],
            }}
            onBarcodeScanned={submitting ? undefined : handleBarcodeScanned}
          />

          {/* Viewfinder reticle overlay */}
          <View style={styles.viewfinderOverlay}>
            <View style={styles.reticleBox}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
            </View>
          </View>

          {submitting ? (
            <View style={styles.submittingOverlay}>
              <ActivityIndicator size="large" color="#ffffff" />
              <Text style={styles.submittingText}>Verifying attendance...</Text>
            </View>
          ) : null}
        </View>

        <TouchableOpacity
          style={styles.toggleManualButton}
          onPress={() => setShowManualInput(!showManualInput)}
        >
          <Text style={styles.toggleManualText}>
            {showManualInput ? '▲ Hide Code Input' : '▼ Having camera issues? Enter QR code'}
          </Text>
        </TouchableOpacity>

        {showManualInput ? (
          <View style={styles.manualBox}>
            <Text style={styles.manualLabel}>Paste QR Payload JSON:</Text>
            <TextInput
              style={styles.manualInput}
              placeholder='{"sessionId":"...","code":"..."}'
              placeholderTextColor="#94a3b8"
              value={manualPayload}
              onChangeText={setManualPayload}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={[
                styles.primaryButton,
                (!manualPayload.trim() || submitting) && styles.buttonDisabled,
              ]}
              onPress={handleManualSubmit}
              disabled={!manualPayload.trim() || submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>Verify & Check In</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 500,
    padding: 16,
  },
  scrollContainer: {
    width: '100%',
    maxWidth: 500,
    alignItems: 'center',
    paddingVertical: 12,
  },
  card: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginLeft: 12,
  },
  backButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  backButtonText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '600',
  },
  scannerInstruction: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 16,
    lineHeight: 18,
  },
  cameraFrame: {
    width: '100%',
    height: 320,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    position: 'relative',
    marginBottom: 14,
  },
  viewfinderOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reticleBox: {
    width: 200,
    height: 200,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#22c55e',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  submittingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  submittingText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
  },
  toggleManualButton: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  toggleManualText: {
    color: '#2563eb',
    fontSize: 13,
    fontWeight: '600',
  },
  manualBox: {
    marginTop: 12,
    padding: 14,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  manualLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
  },
  manualInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    padding: 10,
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 10,
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
    width: '100%',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
    width: '100%',
  },
  secondaryButtonText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
  },
  buttonDisabled: {
    backgroundColor: '#93c5fd',
  },
  // Success Card styles
  successCard: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  successIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#dcfce7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  successCheckText: {
    fontSize: 32,
    color: '#16a34a',
    fontWeight: 'bold',
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#166534',
    textAlign: 'center',
    marginBottom: 6,
  },
  successSubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  resultDetailsBox: {
    width: '100%',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 20,
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '600',
  },
  presentBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  presentBadgeText: {
    color: '#16a34a',
    fontSize: 12,
    fontWeight: '700',
  },
  // Error Card styles
  errorCard: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  errorIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fee2e2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  errorIconText: {
    fontSize: 28,
    color: '#dc2626',
    fontWeight: 'bold',
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#991b1b',
    textAlign: 'center',
    marginBottom: 6,
  },
  errorReason: {
    fontSize: 13,
    color: '#dc2626',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 18,
  },
  errorHint: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 18,
    lineHeight: 16,
  },
  retryButton: {
    backgroundColor: '#dc2626',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
    width: '100%',
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Alert Card styles
  alertCard: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  alertIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fef3c7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  alertIconText: {
    fontSize: 26,
  },
  alertTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#92400e',
    textAlign: 'center',
    marginBottom: 6,
  },
  alertBody: {
    fontSize: 13,
    color: '#78350f',
    textAlign: 'center',
    marginBottom: 18,
    lineHeight: 18,
  },
});
