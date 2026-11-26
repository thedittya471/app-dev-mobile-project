import { useState, useRef } from 'react';
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
  const [cameraFailed, setCameraFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successData, setSuccessData] = useState(null);
  const [errorData, setErrorData] = useState(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualPayload, setManualPayload] = useState('');

  // Ref lock to completely suppress repeated camera callbacks while processing
  const isSubmittingRef = useRef(false);

  async function processPayload(rawString) {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSubmitting(true);
    setErrorData(null);

    try {
      let parsed;
      try {
        parsed = JSON.parse(rawString.trim());
      } catch {
        throw new Error('Invalid QR payload. Use the current classroom QR code.');
      }

      if (
        !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(parsed?.sessionId) ||
        !/^[a-f0-9]{32}$/i.test(parsed?.code)
      ) {
        throw new Error('Invalid QR payload. Use the current classroom QR code.');
      }

      const result = await submitCheckIn({ sessionId: parsed.sessionId, code: parsed.code });
      if (result.record?.status !== 'present') {
        throw new Error('The server did not confirm attendance. Ask your teacher to review it.');
      }
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
  }

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

  if (successData) {
    const isRepeat = successData.repeated;
    return (
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.card}>
          <View style={styles.successCard}>
            <View style={styles.successIconCircle}>
              <Text style={styles.successCheckText}>✓</Text>
            </View>
            <Text accessibilityRole="header" style={styles.successTitle}>
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
                    {successData.record.status.toUpperCase()}
                  </Text>
                </View>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Recorded At:</Text>
                <Text style={styles.detailValue}>
                  {new Date(successData.record.recordedAt).toLocaleString()}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Method:</Text>
                <Text style={styles.detailValue}>
                  {successData.record.method === 'qr_scan' ? 'QR scan' : 'Teacher entry'}
                </Text>
              </View>
            </View>

            <TouchableOpacity accessibilityRole="button" style={styles.primaryButton} onPress={onBack}>
              <Text style={styles.primaryButtonText}>Back to Today</Text>
            </TouchableOpacity>

            <TouchableOpacity accessibilityRole="button" style={styles.secondaryButton} onPress={handleRetry}>
              <Text style={styles.secondaryButtonText}>Scan Another Code</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    );
  }

  if (errorData) {
    return (
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.card}>
          <TouchableOpacity accessibilityRole="button" style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>{'← Back to Today'}</Text>
          </TouchableOpacity>

          <View style={styles.errorCard}>
            <View style={styles.errorIconCircle}>
              <Text style={styles.errorIconText}>!</Text>
            </View>
            <Text accessibilityRole="alert" style={styles.errorTitle}>{errorData.title}</Text>
            <Text style={styles.errorReason}>{errorData.message}</Text>
            <Text style={styles.errorHint}>{errorData.actionHint}</Text>

            <TouchableOpacity accessibilityRole="button" style={styles.retryButton} onPress={handleRetry}>
              <Text style={styles.retryButtonText}>Try again</Text>
            </TouchableOpacity>

            <TouchableOpacity accessibilityRole="button" style={styles.secondaryButton} onPress={onBack}>
              <Text style={styles.secondaryButtonText}>Return to Today</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    );
  }

  function handleCameraError() {
    setCameraFailed(true);
    setShowManualInput(true);
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <TouchableOpacity accessibilityRole="button" style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>{'← Back to Today'}</Text>
          </TouchableOpacity>
          <Text accessibilityRole="header" style={styles.headerTitle}>Scan classroom QR</Text>
        </View>

        <Text style={styles.scannerInstruction}>
          Point camera at the QR code displayed on the teacher’s screen or projector.
        </Text>

        {permission?.granted && !cameraFailed ? (
        <View style={styles.cameraFrame}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ['qr'],
            }}
            onMountError={handleCameraError}
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
              <ActivityIndicator size="large" color="#5ab9fc" />
              <Text style={styles.submittingText}>Verifying attendance...</Text>
            </View>
          ) : null}
        </View>
        ) : (
          <View style={styles.alertCard}>
            <Text style={styles.alertBody}>
              {cameraFailed
                ? 'The camera could not start. Paste the active QR payload or ask your teacher to mark you present.'
                : permission?.canAskAgain === false
                  ? 'Allow camera access in settings, paste the active QR payload, or ask your teacher to mark you present.'
                  : 'Enable camera access to scan the classroom code.'}
            </Text>
            {!permission?.granted && permission?.canAskAgain ? (
              <TouchableOpacity accessibilityRole="button" style={styles.primaryButton} onPress={requestPermission}>
                <Text style={styles.primaryButtonText}>Enable camera</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ expanded: showManualInput }}
          style={styles.toggleManualButton}
          onPress={() => setShowManualInput(!showManualInput)}
        >
          <Text style={styles.toggleManualText}>
            {showManualInput ? 'Hide QR input' : 'Paste QR payload'}
          </Text>
        </TouchableOpacity>

        {showManualInput ? (
          <View style={styles.manualBox}>
            <Text style={styles.manualLabel}>Active QR payload</Text>
            <TextInput
              style={styles.manualInput}
              accessibilityLabel="Active QR payload"
              placeholder="Paste the full payload"
              placeholderTextColor="#94a3b8"
              value={manualPayload}
              onChangeText={setManualPayload}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity accessibilityRole="button"
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
  scrollContainer: {
    paddingHorizontal: 12,
    paddingVertical: 24,
    alignItems: 'center',
    width: '100%',
  },
  card: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#131824',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#1f2738',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#f1f5f9',
    marginLeft: 12,
  },
  backButton: {
    minHeight: 44,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#1a2030',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#253046',
    alignSelf: 'flex-start',
  },
  backButtonText: {
    color: '#8e9cb2',
    fontSize: 12,
    fontWeight: '600',
  },
  scannerInstruction: {
    fontSize: 13,
    color: '#8e9cb2',
    marginBottom: 16,
    lineHeight: 18,
  },
  cameraFrame: {
    width: '100%',
    height: 320,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#0a0d14',
    position: 'relative',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1f2738',
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
    borderColor: '#5ab9fc',
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
    backgroundColor: 'rgba(10, 13, 20, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  submittingText: {
    color: '#f1f5f9',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 10,
  },
  toggleManualButton: {
    minHeight: 44,
    paddingVertical: 10,
    alignItems: 'center',
  },
  toggleManualText: {
    color: '#5ab9fc',
    fontSize: 13,
    fontWeight: '600',
  },
  manualBox: {
    marginTop: 12,
    padding: 16,
    backgroundColor: '#0f1420',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2738',
  },
  manualLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8e9cb2',
    marginBottom: 8,
  },
  manualInput: {
    backgroundColor: '#1a2030',
    borderWidth: 1,
    borderColor: '#253046',
    borderRadius: 8,
    padding: 12,
    fontSize: 13,
    color: '#f1f5f9',
    fontFamily: 'monospace',
    marginBottom: 12,
  },
  primaryButton: {
    minHeight: 44,
    backgroundColor: '#5ab9fc',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
    width: '100%',
  },
  primaryButtonText: {
    color: '#0a0d14',
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryButton: {
    minHeight: 44,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
    width: '100%',
  },
  secondaryButtonText: {
    color: '#5ab9fc',
    fontSize: 13,
    fontWeight: '600',
  },
  buttonDisabled: {
    backgroundColor: '#1a2030',
  },
  // Success Card styles
  successCard: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  successIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#0b2e23',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#10b981',
  },
  successCheckText: {
    fontSize: 32,
    color: '#34d399',
    fontWeight: 'bold',
  },
  successTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#f1f5f9',
    textAlign: 'center',
    marginBottom: 6,
  },
  successSubtitle: {
    fontSize: 13,
    color: '#8e9cb2',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  resultDetailsBox: {
    width: '100%',
    backgroundColor: '#0f1420',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1f2738',
    marginBottom: 20,
    gap: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 13,
    color: '#8e9cb2',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 13,
    color: '#f1f5f9',
    fontWeight: '600',
  },
  presentBadge: {
    backgroundColor: '#0b2e23',
    borderWidth: 1,
    borderColor: '#10b981',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  presentBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#34d399',
  },
  // Error Card styles
  errorCard: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  errorIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#381418',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  errorIconText: {
    fontSize: 28,
  },
  errorTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#f1f5f9',
    textAlign: 'center',
    marginBottom: 6,
  },
  errorReason: {
    fontSize: 13,
    color: '#fca5a5',
    textAlign: 'center',
    marginBottom: 8,
    fontWeight: '600',
  },
  errorHint: {
    fontSize: 12,
    color: '#8e9cb2',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  retryButton: {
    backgroundColor: '#ef4444',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    width: '100%',
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  // Alert Card styles
  alertCard: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  alertBody: {
    fontSize: 13,
    color: '#8e9cb2',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
});
