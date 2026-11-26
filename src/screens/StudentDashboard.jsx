import { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  TextInput,
} from 'react-native';
import { getPeriodById } from '../services/schedule';
import useSchedule from '../hooks/useSchedule';
import { getStudentAttendance } from '../services/attendance';
import { getStudentPreferences, saveStudentPreferences } from '../services/preferences';
import StudentScanScreen from './StudentScanScreen';

export default function StudentDashboard({ user, onSignOut }) {
  const [currentView, setCurrentView] = useState('today');
  const [selectedDate, setSelectedDate] = useState('today');
  const { scheduleData, loading, error, refresh: refreshSchedule } = useSchedule(selectedDate);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  const [attendanceData, setAttendanceData] = useState({
    summary: { totalSessions: 0, presentSessions: 0, absentSessions: 0, percentage: 0 },
    bySubject: [],
    records: [],
  });
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState(null);

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

  const [careerGoal, setCareerGoal] = useState('');
  const [interests, setInterests] = useState([]);
  const [strengths, setStrengths] = useState([]);
  const [interestInput, setInterestInput] = useState('');
  const [strengthInput, setStrengthInput] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null);

  const loadPreferences = useCallback(async () => {
    setProfileLoading(true);
    setProfileError(null);
    try {
      const data = await getStudentPreferences();
      setCareerGoal(data.careerGoal || '');
      setInterests(Array.isArray(data.interests) ? data.interests : []);
      setStrengths(Array.isArray(data.strengths) ? data.strengths : []);
    } catch (err) {
      setProfileError(err.message || 'Failed to load planning preferences');
    } finally {
      setProfileLoading(false);
    }
  }, []);

  function showView(view) {
    if (view === currentView || profileSaving || detailLoading) return;
    setCurrentView(view);
    if (view === 'attendance') loadAttendance();
    if (view === 'profile') loadPreferences();
  }

  function handleAddInterestTag(rawTag) {
    const tag = String(rawTag || interestInput).trim().toLowerCase();
    if (tag && !interests.includes(tag)) {
      setInterests((prev) => [...prev, tag]);
    }
    setInterestInput('');
    setSaveStatus(null);
  }

  function handleRemoveInterestTag(tagToRemove) {
    setInterests((prev) => prev.filter((t) => t !== tagToRemove));
    setSaveStatus(null);
  }

  function handleAddStrengthTag(rawTag) {
    const tag = String(rawTag || strengthInput).trim().toLowerCase();
    if (tag && !strengths.includes(tag)) {
      setStrengths((prev) => [...prev, tag]);
    }
    setStrengthInput('');
    setSaveStatus(null);
  }

  function handleRemoveStrengthTag(tagToRemove) {
    setStrengths((prev) => prev.filter((t) => t !== tagToRemove));
    setSaveStatus(null);
  }

  async function handleSavePreferences() {
    setProfileSaving(true);
    setSaveStatus(null);
    setProfileError(null);

    let currentInterests = [...interests];
    if (interestInput.trim()) {
      const pending = interestInput.trim().toLowerCase();
      if (!currentInterests.includes(pending)) currentInterests.push(pending);
    }

    let currentStrengths = [...strengths];
    if (strengthInput.trim()) {
      const pending = strengthInput.trim().toLowerCase();
      if (!currentStrengths.includes(pending)) currentStrengths.push(pending);
    }

    try {
      const res = await saveStudentPreferences({
        careerGoal,
        interests: currentInterests,
        strengths: currentStrengths,
      });
      setInterestInput('');
      setStrengthInput('');
      setCareerGoal(res.profile.careerGoal || '');
      setInterests(res.profile.interests || []);
      setStrengths(res.profile.strengths || []);
      refreshSchedule();
      setSaveStatus({ type: 'success', message: '✓ Preferences saved successfully!' });
    } catch (err) {
      setSaveStatus({ type: 'error', message: err.message || 'Failed to save preferences' });
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleClearPreferences() {
    setProfileSaving(true);
    setSaveStatus(null);
    setProfileError(null);
    setInterestInput('');
    setStrengthInput('');

    try {
      await saveStudentPreferences({
        careerGoal: '',
        interests: [],
        strengths: [],
      });
      setCareerGoal('');
      setInterests([]);
      setStrengths([]);
      refreshSchedule();
      setSaveStatus({ type: 'success', message: '✓ Preferences cleared and saved.' });
    } catch (err) {
      setSaveStatus({ type: 'error', message: err.message || 'Failed to clear preferences' });
    } finally {
      setProfileSaving(false);
    }
  }

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
          setSelectedDate('today');
          setSelectedPeriod(null);
          refreshSchedule();
        }}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.identity}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Student Portal</Text>
            </View>
            <Text accessibilityRole="header" style={styles.greeting}>{user.name}</Text>
            <Text style={styles.email}>{user.email}</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" style={styles.signOutButton} onPress={onSignOut}>
            <Text style={styles.signOutButtonText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.portalNav}>
          <TouchableOpacity accessibilityRole="button"
            style={[styles.portalTab, currentView === 'today' && styles.portalTabActive]}
            accessibilityState={{ selected: currentView === 'today' }}
            aria-pressed={currentView === 'today'}
            onPress={() => showView('today')}
          >
            <Text
              style={[styles.portalTabText, currentView === 'today' && styles.portalTabTextActive]}
            >
              Plan
            </Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button"
            style={[styles.portalTab, currentView === 'attendance' && styles.portalTabActive]}
            accessibilityState={{ selected: currentView === 'attendance' }}
            aria-pressed={currentView === 'attendance'}
            onPress={() => showView('attendance')}
          >
            <Text
              style={[
                styles.portalTabText,
                currentView === 'attendance' && styles.portalTabTextActive,
              ]}
            >
              Attendance
            </Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button"
            style={[styles.portalTab, currentView === 'profile' && styles.portalTabActive]}
            accessibilityState={{ selected: currentView === 'profile' }}
            aria-pressed={currentView === 'profile'}
            onPress={() => showView('profile')}
          >
            <Text
              style={[
                styles.portalTabText,
                currentView === 'profile' && styles.portalTabTextActive,
              ]}
            >
              Profile
            </Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button"
            style={[styles.portalTab, styles.scanTab]}
            onPress={() => showView('scan')}
          >
            <Text
              style={[styles.portalTabText, styles.scanTabText]}
            >
              Scan QR
            </Text>
          </TouchableOpacity>
        </View>

        {currentView === 'profile' ? (
          <View style={styles.profileContainer}>
            <View style={styles.profileHeaderRow}>
              <Text style={styles.sectionTitle}>Planning Preferences</Text>
              <TouchableOpacity accessibilityRole="button"
                style={styles.profileRefreshBtn}
                onPress={loadPreferences}
                disabled={profileLoading || profileSaving}
              >
                <Text style={styles.profileRefreshText}>
                  {profileLoading ? '...' : '↻ Reload'}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.profileSubtitle}>
              Customize your career goal, topic interests, and strengths to rank and suggest daily free-period activities.
            </Text>

            {profileLoading && !careerGoal && interests.length === 0 && strengths.length === 0 ? (
              <View style={styles.stateBox}>
                <ActivityIndicator size="small" color="#5ab9fc" />
                <Text style={styles.stateText}>Loading planning preferences...</Text>
              </View>
            ) : profileError ? (
              <View style={[styles.stateBox, styles.errorBox]}>
                <Text style={styles.errorText}>{profileError}</Text>
                <TouchableOpacity accessibilityRole="button" style={styles.retryButton} onPress={loadPreferences}>
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.formContainer}>
                {saveStatus ? (
                  <View
                    style={[
                      styles.feedbackBanner,
                      saveStatus.type === 'success' ? styles.feedbackSuccess : styles.feedbackError,
                    ]}
                  >
                    <Text
                      style={[
                        styles.feedbackText,
                        saveStatus.type === 'success'
                          ? styles.feedbackTextSuccess
                          : styles.feedbackTextError,
                      ]}
                    >
                      {saveStatus.message}
                    </Text>
                  </View>
                ) : null}

                {/* 1. Career Goal */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Career Goal (Optional)</Text>
                  <Text style={styles.inputHint}>e.g. Software Development, Robotics, Medicine</Text>
                  <TextInput
                    accessibilityLabel="Career goal"
                    style={styles.textInput}
                    value={careerGoal}
                    onChangeText={(text) => {
                      setCareerGoal(text);
                      setSaveStatus(null);
                    }}
                    placeholder="e.g. Software Development"
                    placeholderTextColor="#94a3b8"
                    editable={!profileSaving}
                  />
                </View>

                {/* 2. Interests */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Interests & Topics (Optional)</Text>
                  <Text style={styles.inputHint}>Tags matching areas you enjoy exploring</Text>
                  <View style={styles.tagInputRow}>
                    <TextInput
                      style={[styles.textInput, styles.tagTextInput]}
                      accessibilityLabel="Interest"
                      value={interestInput}
                      onChangeText={setInterestInput}
                      onSubmitEditing={() => handleAddInterestTag()}
                      placeholder="Type an interest tag..."
                      placeholderTextColor="#94a3b8"
                      editable={!profileSaving}
                    />
                    <TouchableOpacity accessibilityRole="button"
                      style={styles.addTagButton}
                      onPress={() => handleAddInterestTag()}
                      disabled={!interestInput.trim() || profileSaving}
                    >
                      <Text style={styles.addTagButtonText}>+ Add</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Active Interest Chips */}
                  <View style={styles.tagsContainer}>
                    {interests.map((tag) => (
                      <View key={tag} style={styles.tagChip}>
                        <Text style={styles.tagChipText}>{tag}</Text>
                        <TouchableOpacity accessibilityRole="button"
                          onPress={() => handleRemoveInterestTag(tag)}
                          style={styles.removeTagBtn}
                          disabled={profileSaving}
                        >
                          <Text style={styles.removeTagText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>

                  {/* Suggested tags */}
                  <Text style={styles.suggestionsLabel}>Suggested tags:</Text>
                  <View style={styles.suggestionRow}>
                    {['software development', 'coding', 'robotics', 'algorithms', 'math', 'design', 'writing'].map(
                      (suggested) => (
                        <TouchableOpacity accessibilityRole="button"
                          key={suggested}
                          style={[
                            styles.suggestionChip,
                            interests.includes(suggested) && styles.suggestionChipSelected,
                          ]}
                          onPress={() => handleAddInterestTag(suggested)}
                          disabled={interests.includes(suggested) || profileSaving}
                        >
                          <Text
                            style={[
                              styles.suggestionChipText,
                              interests.includes(suggested) && styles.suggestionChipTextSelected,
                            ]}
                          >
                            {suggested}
                          </Text>
                        </TouchableOpacity>
                      )
                    )}
                  </View>
                </View>

                {/* 3. Strengths */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Strengths & Skills (Optional)</Text>
                  <Text style={styles.inputHint}>Personal aptitudes and strengths</Text>
                  <View style={styles.tagInputRow}>
                    <TextInput
                      style={[styles.textInput, styles.tagTextInput]}
                      accessibilityLabel="Strength"
                      value={strengthInput}
                      onChangeText={setStrengthInput}
                      onSubmitEditing={() => handleAddStrengthTag()}
                      placeholder="Type a strength tag..."
                      placeholderTextColor="#94a3b8"
                      editable={!profileSaving}
                    />
                    <TouchableOpacity accessibilityRole="button"
                      style={styles.addTagButton}
                      onPress={() => handleAddStrengthTag()}
                      disabled={!strengthInput.trim() || profileSaving}
                    >
                      <Text style={styles.addTagButtonText}>+ Add</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Active Strength Chips */}
                  <View style={styles.tagsContainer}>
                    {strengths.map((tag) => (
                      <View key={tag} style={[styles.tagChip, styles.tagChipStrength]}>
                        <Text style={[styles.tagChipText, styles.tagChipTextStrength]}>{tag}</Text>
                        <TouchableOpacity accessibilityRole="button"
                          onPress={() => handleRemoveStrengthTag(tag)}
                          style={styles.removeTagBtn}
                          disabled={profileSaving}
                        >
                          <Text style={styles.removeTagText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>

                  {/* Suggested tags */}
                  <Text style={styles.suggestionsLabel}>Suggested tags:</Text>
                  <View style={styles.suggestionRow}>
                    {['problem-solving', 'logical thinking', 'creativity', 'analysis', 'communication', 'focus'].map(
                      (suggested) => (
                        <TouchableOpacity accessibilityRole="button"
                          key={suggested}
                          style={[
                            styles.suggestionChip,
                            strengths.includes(suggested) && styles.suggestionChipSelected,
                          ]}
                          onPress={() => handleAddStrengthTag(suggested)}
                          disabled={strengths.includes(suggested) || profileSaving}
                        >
                          <Text
                            style={[
                              styles.suggestionChipText,
                              strengths.includes(suggested) && styles.suggestionChipTextSelected,
                            ]}
                          >
                            {suggested}
                          </Text>
                        </TouchableOpacity>
                      )
                    )}
                  </View>
                </View>

                {/* Action Buttons */}
                <View style={styles.actionButtonsRow}>
                  <TouchableOpacity accessibilityRole="button"
                    style={[styles.saveProfileButton, profileSaving && styles.buttonDisabled]}
                    onPress={handleSavePreferences}
                    disabled={profileSaving}
                  >
                    {profileSaving ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.saveProfileButtonText}>💾 Save Preferences</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity accessibilityRole="button"
                    style={[styles.clearProfileButton, profileSaving && styles.buttonDisabled]}
                    onPress={handleClearPreferences}
                    disabled={profileSaving}
                  >
                    <Text style={styles.clearProfileButtonText}>Clear All</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        ) : currentView === 'attendance' ? (
          <View style={styles.attendanceContainer}>
            <View style={styles.attendanceHeaderRow}>
              <Text style={styles.sectionTitle}>My Attendance</Text>
              <TouchableOpacity accessibilityRole="button"
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
                <ActivityIndicator size="small" color="#5ab9fc" />
                <Text style={styles.stateText}>Loading attendance records...</Text>
              </View>
            ) : attendanceError ? (
              <View style={[styles.stateBox, styles.errorBox]}>
                <Text style={styles.errorText}>{attendanceError}</Text>
                <TouchableOpacity accessibilityRole="button" style={styles.retryButton} onPress={loadAttendance}>
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
                <TouchableOpacity accessibilityRole="button" style={styles.refreshButton} onPress={loadAttendance}>
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
            <TouchableOpacity accessibilityRole="button"
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

              <TouchableOpacity accessibilityRole="button"
                style={styles.scanActionButton}
                onPress={() => showView('scan')}
              >
                <Text style={styles.scanActionButtonText}>📷 Scan Attendance QR</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View>
            <View style={styles.dateSelector}>
              <TouchableOpacity accessibilityRole="button"
                style={[styles.dateTab, selectedDate === 'today' && styles.dateTabActive]}
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
                style={[styles.dateTab, selectedDate === 'tomorrow' && styles.dateTabActive]}
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

            <Text accessibilityRole="header" style={styles.sectionTitle}>Daily plan</Text>

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
                <Text style={styles.stateText}>Loading classes...</Text>
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
                <Text style={styles.emptyTitle}>No Classes Scheduled</Text>
                <Text style={styles.emptySubtitle}>
                  There are no classes scheduled for this date in the institution calendar.
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
                {(scheduleData.timeline || scheduleData.schedule).map((item, index) => {
                  if (item.type === 'free') {
                    return (
                      <View key={item.id || `free-${index}`} style={styles.freePeriodCard}>
                        <View style={styles.freePeriodBadge}>
                          <Text style={styles.freePeriodBadgeText}>Free period</Text>
                          <Text style={styles.freePeriodDurationText}>{item.durationFormatted}</Text>
                        </View>
                        <Text style={styles.freePeriodTime}>{item.formattedTime}</Text>
                        <Text style={styles.freePeriodMeta}>
                          {item.durationMinutes} min open window within school hours
                        </Text>

                        {item.suggestion ? (
                          <View style={styles.suggestionCard}>
                            <View style={styles.suggestionHeader}>
                              <Text style={styles.suggestionTagLabel}>
                                {item.suggestion.isGeneral ? 'General study' : 'Suggested activity'}
                              </Text>
                              <Text style={styles.suggestionDurationBadge}>
                                {item.suggestion.durationFormatted}
                              </Text>
                            </View>
                            <Text style={styles.suggestionTitle}>{item.suggestion.title}</Text>
                            <View style={styles.suggestionTagsRow}>
                              {item.suggestion.tags?.map((t) => (
                                <View key={t} style={styles.suggestionTagMini}>
                                  <Text style={styles.suggestionTagMiniText}>{t}</Text>
                                </View>
                              ))}
                            </View>
                          </View>
                        ) : null}
                      </View>
                    );
                  }
                  return (
                    <TouchableOpacity accessibilityRole="button"
                      key={item.id}
                      style={styles.classItem}
                      onPress={() => handleOpenPeriod(item.id)}
                      disabled={detailLoading}
                    >
                        <View style={styles.classDetails}>
                        <Text style={styles.classTime}>{item.formattedTime}</Text>
                        <Text style={styles.classSubject}>{item.subject}</Text>
                        <Text style={styles.classMeta}>
                          {item.teacherName} • {item.sectionName}
                        </Text>
                      </View>
                      <Text style={styles.arrowText}>{"→"}</Text>
                    </TouchableOpacity>
                  );
                })}
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
    maxWidth: 730,
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
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.25)',
    marginBottom: 8,
  },
  badgeText: {
    color: '#34d399',
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
  freePeriodCard: {
    padding: 14,
    backgroundColor: '#0f1420',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(90, 185, 252, 0.3)',
    marginBottom: 6,
  },
  freePeriodBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(90, 185, 252, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
  },
  freePeriodBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#5ab9fc',
    textTransform: 'uppercase',
  },
  freePeriodDurationText: {
    fontSize: 11,
    color: '#5ab9fc',
    fontWeight: '700',
    marginLeft: 6,
  },
  freePeriodTime: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 2,
  },
  freePeriodMeta: {
    fontSize: 12,
    color: '#8e9cb2',
  },
  suggestionCard: {
    marginTop: 10,
    padding: 12,
    backgroundColor: '#131824',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1f2738',
  },
  suggestionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  suggestionTagLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#5ab9fc',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  suggestionDurationBadge: {
    fontSize: 10,
    color: '#8e9cb2',
    fontWeight: '600',
  },
  suggestionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 6,
  },
  suggestionTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  suggestionTagMini: {
    backgroundColor: '#1a2030',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  suggestionTagMiniText: {
    fontSize: 10,
    color: '#8e9cb2',
    fontWeight: '500',
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
  portalNav: {
    flexDirection: 'row',
    marginBottom: 18,
    borderRadius: 12,
    backgroundColor: '#0f1420',
    padding: 3,
    borderWidth: 1,
    borderColor: '#1f2738',
  },
  portalTab: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  portalTabActive: { backgroundColor: '#25364e' },
  scanTab: { backgroundColor: '#83cef9' },
  scanTabText: { color: '#102033', fontWeight: '800' },
  portalTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8e9cb2',
  },
  portalTabTextActive: {
    color: '#f1f5f9',
    fontWeight: '800',
  },
  scanActionButton: {
    marginTop: 14,
    backgroundColor: '#5ab9fc',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  scanActionButtonText: {
    color: '#0a0d14',
    fontSize: 14,
    fontWeight: '800',
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
    backgroundColor: '#1a2030',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#253046',
  },
  attendanceRefreshText: {
    fontSize: 12,
    color: '#5ab9fc',
    fontWeight: '600',
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 8,
    textAlign: 'center',
  },
  summaryCard: {
    backgroundColor: '#0f1420',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1f2738',
    padding: 18,
    marginBottom: 16,
  },
  summaryTop: {
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryPercentText: {
    fontSize: 38,
    fontWeight: '800',
    color: '#f1f5f9',
    letterSpacing: -1,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#8e9cb2',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
    marginTop: 2,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#1a2030',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#34d399',
    borderRadius: 4,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1f2738',
  },
  statCol: {
    alignItems: 'center',
    flex: 1,
  },
  statNum: {
    fontSize: 18,
    fontWeight: '800',
    color: '#f1f5f9',
  },
  statPresent: {
    color: '#34d399',
  },
  statAbsent: {
    color: '#f87171',
  },
  statLabel: {
    fontSize: 11,
    color: '#8e9cb2',
    marginTop: 2,
    fontWeight: '500',
  },
  subSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 10,
    marginTop: 4,
  },
  subjectList: {
    gap: 8,
    marginBottom: 16,
  },
  subjectCard: {
    backgroundColor: '#0f1420',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2738',
    padding: 14,
  },
  subjectTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  subjectName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  subjectBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeGood: {
    backgroundColor: '#0b2e23',
    borderWidth: 1,
    borderColor: '#10b981',
  },
  badgeWarning: {
    backgroundColor: '#38260b',
    borderWidth: 1,
    borderColor: '#d97706',
  },
  badgeDanger: {
    backgroundColor: '#381418',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  subjectBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  badgeTextGood: {
    color: '#34d399',
  },
  badgeTextWarning: {
    color: '#fbbf24',
  },
  badgeTextDanger: {
    color: '#f87171',
  },
  subjectCountsText: {
    fontSize: 12,
    color: '#8e9cb2',
    marginBottom: 8,
  },
  subjectProgressBarBg: {
    height: 4,
    backgroundColor: '#1a2030',
    borderRadius: 2,
    overflow: 'hidden',
  },
  subjectProgressBarFill: {
    height: '100%',
    backgroundColor: '#34d399',
    borderRadius: 2,
  },
  recordList: {
    gap: 8,
    marginBottom: 16,
  },
  recordCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0f1420',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1f2738',
    padding: 12,
  },
  recordDetails: {
    flex: 1,
  },
  recordSubject: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 2,
  },
  recordMeta: {
    fontSize: 11,
    color: '#8e9cb2',
  },
  recordSection: {
    fontSize: 11,
    color: '#5ab9fc',
    marginTop: 2,
  },
  recordStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },
  recordStatusPresent: {
    backgroundColor: '#0b2e23',
    borderWidth: 1,
    borderColor: '#10b981',
  },
  recordStatusAbsent: {
    backgroundColor: '#381418',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  recordStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  recordStatusTextPresent: {
    color: '#34d399',
  },
  recordStatusTextAbsent: {
    color: '#f87171',
  },
  profileContainer: {
    marginTop: 4,
  },
  profileHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  profileRefreshBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#1a2030',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#253046',
  },
  profileRefreshText: {
    fontSize: 12,
    color: '#5ab9fc',
    fontWeight: '600',
  },
  profileSubtitle: {
    fontSize: 13,
    color: '#8e9cb2',
    lineHeight: 18,
    marginBottom: 16,
  },
  formContainer: {
    gap: 16,
  },
  feedbackBanner: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  feedbackSuccess: {
    backgroundColor: '#0b2e23',
    borderColor: '#10b981',
  },
  feedbackError: {
    backgroundColor: '#381418',
    borderColor: '#ef4444',
  },
  feedbackText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  feedbackTextSuccess: {
    color: '#34d399',
  },
  feedbackTextError: {
    color: '#f87171',
  },
  inputGroup: {
    backgroundColor: '#0f1420',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1f2738',
    padding: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#f1f5f9',
    marginBottom: 2,
    letterSpacing: 0.3,
  },
  inputHint: {
    fontSize: 12,
    color: '#8e9cb2',
    marginBottom: 10,
  },
  textInput: {
    backgroundColor: '#1a2030',
    borderWidth: 1,
    borderColor: '#253046',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#f1f5f9',
  },
  tagInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  tagTextInput: {
    flex: 1,
  },
  addTagButton: {
    backgroundColor: '#5ab9fc',
    paddingHorizontal: 14,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addTagButtonText: {
    color: '#0a0d14',
    fontSize: 13,
    fontWeight: '800',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#102235',
    borderWidth: 1,
    borderColor: 'rgba(90, 185, 252, 0.4)',
    borderRadius: 16,
    paddingVertical: 4,
    paddingLeft: 10,
    paddingRight: 6,
    gap: 6,
  },
  tagChipText: {
    fontSize: 12,
    color: '#5ab9fc',
    fontWeight: '700',
  },
  tagChipStrength: {
    backgroundColor: '#0b2e23',
    borderColor: '#10b981',
  },
  tagChipTextStrength: {
    color: '#34d399',
  },
  removeTagBtn: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#1a2030',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeTagText: {
    fontSize: 9,
    color: '#8e9cb2',
    fontWeight: 'bold',
  },
  suggestionsLabel: {
    fontSize: 10,
    color: '#627289',
    fontWeight: '800',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  suggestionChip: {
    backgroundColor: '#1a2030',
    borderWidth: 1,
    borderColor: '#253046',
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  suggestionChipSelected: {
    backgroundColor: '#0f1420',
    borderColor: '#1f2738',
  },
  suggestionChipText: {
    fontSize: 11,
    color: '#8e9cb2',
    fontWeight: '600',
  },
  suggestionChipTextSelected: {
    color: '#627289',
    textDecorationLine: 'line-through',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  saveProfileButton: {
    flex: 2,
    backgroundColor: '#5ab9fc',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#5ab9fc',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  saveProfileButtonText: {
    color: '#0a0d14',
    fontSize: 14,
    fontWeight: '800',
  },
  clearProfileButton: {
    flex: 1,
    backgroundColor: '#1a2030',
    borderWidth: 1,
    borderColor: '#253046',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearProfileButtonText: {
    color: '#8e9cb2',
    fontSize: 14,
    fontWeight: '600',
  },
});
