import AsyncStorage from '@react-native-async-storage/async-storage';

export const SAMPLE_USERS = [
  {
    id: 'usr-teacher-1',
    email: 'teacher@pilot.edu',
    name: 'Prof. Alan Smith',
    role: 'teacher',
  },
  {
    id: 'usr-teacher-2',
    email: 'teacher2@pilot.edu',
    name: 'Prof. Bob Wilson',
    role: 'teacher',
  },
  {
    id: 'usr-student-1',
    email: 'student1@pilot.edu',
    name: 'Jane Doe',
    role: 'student',
  },
  {
    id: 'usr-student-2',
    email: 'student2@pilot.edu',
    name: 'John River',
    role: 'student',
  },
  {
    id: 'usr-student-3',
    email: 'student3@pilot.edu',
    name: 'Alex Chen',
    role: 'student',
  },
  {
    id: 'usr-student-4',
    email: 'student4@pilot.edu',
    name: 'Sophia Patel',
    role: 'student',
  },
  {
    id: 'usr-student-5',
    email: 'student5@pilot.edu',
    name: 'Marcus Vance',
    role: 'student',
  },
];

const SAMPLE_ROSTER_BASE = [
  { id: 'usr-student-1', studentId: 'usr-student-1', studentName: 'Jane Doe', studentEmail: 'student1@pilot.edu', status: 'present' },
  { id: 'usr-student-2', studentId: 'usr-student-2', studentName: 'John River', studentEmail: 'student2@pilot.edu', status: 'present' },
  { id: 'usr-student-3', studentId: 'usr-student-3', studentName: 'Alex Chen', studentEmail: 'student3@pilot.edu', status: 'present' },
  { id: 'usr-student-4', studentId: 'usr-student-4', studentName: 'Sophia Patel', studentEmail: 'student4@pilot.edu', status: 'pending' },
  { id: 'usr-student-5', studentId: 'usr-student-5', studentName: 'Marcus Vance', studentEmail: 'student5@pilot.edu', status: 'absent' },
];

// High-resolution lightweight data URI for offline QR display
const SAMPLE_QR_DATA_URL =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23ffffff"/><path d="M10 10h30v30h-30z M15 15h20v20h-20z M20 20h10v10h-10z M60 10h30v30h-30z M65 15h20v20h-20z M70 20h10v10h-10z M10 60h30v30h-30z M15 65h20v20h-20z M20 70h10v10h-10z M45 15h10v10h-10z M45 35h10v10h-10z M15 45h10v10h-10z M35 45h10v10h-10z M45 45h10v10h-10z M55 45h10v10h-10z M75 45h10v10h-10z M45 65h10v10h-10z M65 65h10v10h-10z M85 65h10v10h-10z M55 75h10v10h-10z M75 75h10v10h-10z M65 85h10v10h-10z M85 85h10v10h-10z" fill="%230f172a"/></svg>';

function formatDateIST(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function getSampleSchedule(role, dateParam = 'today') {
  const now = new Date();
  const istDateStr = formatDateIST(now);

  const isToday = !dateParam || dateParam === 'today';
  let targetDate = istDateStr;

  if (!isToday) {
    const target = dateParam === 'tomorrow'
      ? new Date(now.getTime() + 24 * 60 * 60 * 1000)
      : new Date(dateParam);
    targetDate = formatDateIST(target);
  }

  const classes = [
    {
      id: 'prd-cs-101',
      subject: 'Database Systems & Architecture',
      room: 'Lab 302',
      sectionName: 'Computer Science A',
      teacherName: 'Prof. Alan Smith',
      startTime: `${targetDate}T09:00:00+05:30`,
      endTime: `${targetDate}T10:00:00+05:30`,
      formattedTime: '09:00 AM - 10:00 AM IST',
      periodDate: targetDate,
      timezone: 'Asia/Kolkata',
      status: isToday ? 'open' : 'upcoming',
      activeSessionId: isToday ? 'ses-mobile-demo' : null,
      session: isToday ? {
        id: 'ses-mobile-demo',
        status: 'open',
      } : null,
    },
    {
      id: 'prd-cs-102',
      subject: 'Mobile App Development (React Native)',
      room: 'Studio 104',
      sectionName: 'Computer Science A',
      teacherName: 'Prof. Alan Smith',
      startTime: `${targetDate}T11:30:00+05:30`,
      endTime: `${targetDate}T12:30:00+05:30`,
      formattedTime: '11:30 AM - 12:30 PM IST',
      periodDate: targetDate,
      timezone: 'Asia/Kolkata',
      status: 'upcoming',
    },
    {
      id: 'prd-cs-103',
      subject: 'Algorithms & Data Structures',
      room: 'Lecture Hall B',
      sectionName: 'Computer Science A',
      teacherName: 'Prof. Alan Smith',
      startTime: `${targetDate}T14:00:00+05:30`,
      endTime: `${targetDate}T15:15:00+05:30`,
      formattedTime: '02:00 PM - 03:15 PM IST',
      periodDate: targetDate,
      timezone: 'Asia/Kolkata',
      status: 'upcoming',
    },
  ];

  const freePeriods = [
    {
      startTime: `${targetDate}T10:00:00+05:30`,
      endTime: `${targetDate}T11:30:00+05:30`,
      durationMinutes: 90,
      formattedTime: '10:00 AM - 11:30 AM IST',
      suggestedActivity: {
        id: 'act-code-challenge',
        title: 'Solve Python Algorithm Challenge',
        duration: 25,
        category: 'STEM',
        tags: ['coding', 'algorithms', 'python', 'problem-solving'],
      },
    },
    {
      startTime: `${targetDate}T12:30:00+05:30`,
      endTime: `${targetDate}T14:00:00+05:30`,
      durationMinutes: 90,
      formattedTime: '12:30 PM - 02:00 PM IST',
      suggestedActivity: {
        id: 'act-ui-wireframe',
        title: 'Sketch Mobile App UI Wireframe',
        duration: 30,
        category: 'Design',
        tags: ['design', 'ui/ux', 'creativity', 'mobile'],
      },
    },
  ];

  return {
    schedule: classes,
    freePeriods,
    institutionDate: targetDate,
    institutionTimezone: 'Asia/Kolkata',
  };
}

let activeRosterState = [...SAMPLE_ROSTER_BASE];
let activeSessionStatus = 'open';

export function getSampleSession(sessionId = 'ses-mobile-demo') {
  const now = new Date();
  const istDateStr = formatDateIST(now);

  const presentCount = activeRosterState.filter((s) => s.status === 'present').length;
  const absentCount = activeRosterState.filter((s) => s.status === 'absent').length;
  const totalStudents = activeRosterState.length;
  const percentage = Math.round((presentCount / (totalStudents || 1)) * 100);

  return {
    session: {
      id: sessionId,
      periodId: 'prd-cs-101',
      status: activeSessionStatus,
      openedAt: `${istDateStr}T09:00:00+05:30`,
      closedAt: activeSessionStatus === 'closed' ? `${istDateStr}T10:00:00+05:30` : null,
      subject: 'Database Systems & Architecture',
      room: 'Lab 302',
      sectionName: 'Computer Science A',
      teacherName: 'Prof. Alan Smith',
    },
    period: {
      id: 'prd-cs-101',
      subject: 'Database Systems & Architecture',
      room: 'Lab 302',
      sectionName: 'Computer Science A',
      teacherName: 'Prof. Alan Smith',
      date: istDateStr,
      formattedTime: '09:00 AM - 10:00 AM IST',
      startTime: `${istDateStr}T09:00:00+05:30`,
      endTime: `${istDateStr}T10:00:00+05:30`,
      timezone: 'Asia/Kolkata',
    },
    roster: activeRosterState,
    summary: {
      totalStudents,
      totalEnrolled: totalStudents,
      presentStudents: presentCount,
      checkedInCount: presentCount,
      absentStudents: absentCount,
      absentCount: absentCount,
      pendingCount: activeRosterState.filter((s) => s.status === 'pending').length,
      attendancePercentage: percentage,
      percentage: percentage,
    },
    code: 'ATT-8842',
    expiresInSeconds: 45,
    qrDataUrl: SAMPLE_QR_DATA_URL,
  };
}

export function updateSampleRosterStatus(studentId, newStatus) {
  activeRosterState = activeRosterState.map((s) =>
    s.id === studentId || s.studentId === studentId ? { ...s, status: newStatus } : s
  );
  return getSampleSession();
}

export function setSampleSessionStatus(status) {
  activeSessionStatus = status;
  return getSampleSession();
}

export function getSampleStudentAttendance() {
  return {
    summary: {
      totalSessions: 24,
      presentSessions: 22,
      absentSessions: 2,
      percentage: 92,
    },
    bySubject: [
      { subject: 'Database Systems & Architecture', present: 8, total: 8, percentage: 100 },
      { subject: 'Mobile App Development', present: 7, total: 8, percentage: 88 },
      { subject: 'Algorithms & Data Structures', present: 7, total: 8, percentage: 88 },
    ],
    records: [
      {
        id: 'rec-1',
        subject: 'Database Systems & Architecture',
        date: 'Today, 09:30 AM IST',
        status: 'present',
        method: 'qr_scan',
      },
      {
        id: 'rec-2',
        subject: 'Mobile App Development',
        date: 'Yesterday, 11:30 AM IST',
        status: 'present',
        method: 'qr_scan',
      },
      {
        id: 'rec-3',
        subject: 'Algorithms & Data Structures',
        date: 'Nov 23, 02:00 PM IST',
        status: 'present',
        method: 'qr_scan',
      },
      {
        id: 'rec-4',
        subject: 'Mobile App Development',
        date: 'Nov 22, 11:30 AM IST',
        status: 'absent',
        method: 'manual',
      },
    ],
  };
}

export async function getSamplePreferences(studentId) {
  try {
    const raw = await AsyncStorage.getItem(`sample_pref_${studentId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { profile: parsed, ...parsed };
    }
  } catch {}

  const defaultPrefs = {
    careerGoal: 'Full-Stack Mobile & Cloud Engineer',
    interests: ['react-native', 'web-development', 'machine-learning', 'ui/ux'],
    strengths: ['problem-solving', 'algorithms', 'clean-code', 'debugging'],
  };
  return { profile: defaultPrefs, ...defaultPrefs };
}

export async function saveSamplePreferences(studentId, prefs) {
  try {
    await AsyncStorage.setItem(`sample_pref_${studentId}`, JSON.stringify(prefs));
  } catch {}
  return { profile: prefs, ...prefs };
}
