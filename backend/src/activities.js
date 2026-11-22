import { formatDuration } from './freePeriods.js';

export const ACTIVITY_CATALOG = [
  {
    id: 'act-code-challenge',
    title: 'Solve Python Algorithm Challenge',
    duration: 20,
    tags: ['software development', 'coding', 'algorithms', 'problem-solving', 'python'],
    category: 'STEM',
  },
  {
    id: 'act-code-debug',
    title: 'Debug & Refactor Code Project',
    duration: 30,
    tags: ['software development', 'coding', 'debugging', 'logic', 'software engineer'],
    category: 'STEM',
  },
  {
    id: 'act-robotics-circuit',
    title: 'Microcontroller Circuit Simulation',
    duration: 30,
    tags: ['robotics', 'engineering', 'hardware', 'problem-solving'],
    category: 'STEM',
  },
  {
    id: 'act-math-practice',
    title: 'Calculus & Linear Algebra Problem Set',
    duration: 25,
    tags: ['math', 'mathematics', 'logical thinking', 'analysis', 'data science'],
    category: 'STEM',
  },
  {
    id: 'act-data-viz',
    title: 'Analyze Dataset & Plot Visualizations',
    duration: 35,
    tags: ['data science', 'statistics', 'analysis', 'python', 'coding'],
    category: 'STEM',
  },
  {
    id: 'act-ui-wireframe',
    title: 'Sketch Mobile App UI Wireframe',
    duration: 20,
    tags: ['design', 'ui/ux', 'creativity', 'web development', 'graphic design'],
    category: 'Design',
  },
  {
    id: 'act-tech-article',
    title: 'Read Tech Architecture Whitepaper',
    duration: 15,
    tags: ['software development', 'reading', 'computer science', 'focus'],
    category: 'Learning',
  },
  {
    id: 'act-writing-draft',
    title: 'Draft Essay Argument & Thesis Outline',
    duration: 25,
    tags: ['writing', 'creative writing', 'communication', 'humanities'],
    category: 'Humanities',
  },
  // General study & planning tasks (fallback for empty preferences or non-matches)
  {
    id: 'act-review-notes',
    title: 'Review Recent Class Notes & Summarize Key Concepts',
    duration: 15,
    tags: ['general', 'study', 'review', 'learning'],
    isGeneral: true,
    category: 'General',
  },
  {
    id: 'act-organize-tasks',
    title: 'Plan Weekly Deadlines & Homework Goals',
    duration: 20,
    tags: ['general', 'planning', 'organization', 'focus'],
    isGeneral: true,
    category: 'General',
  },
  {
    id: 'act-flashcards',
    title: 'Spaced Repetition Flashcard Review',
    duration: 25,
    tags: ['general', 'study', 'memory', 'focus'],
    isGeneral: true,
    category: 'General',
  },
  {
    id: 'act-deep-study',
    title: 'Deep Focus Independent Study Session',
    duration: 45,
    tags: ['general', 'study', 'focus', 'deep work'],
    isGeneral: true,
    category: 'General',
  },
];

export function suggestActivityForGap({
  gapDurationMinutes,
  careerGoal = '',
  interests = [],
  strengths = [],
  catalog = ACTIVITY_CATALOG,
  usedActivityIds = new Set(),
}) {
  if (!gapDurationMinutes || gapDurationMinutes <= 0) return null;

  // Filter tasks that fit within the gap duration
  const eligible = catalog.filter((t) => t.duration <= gapDurationMinutes);
  if (eligible.length === 0) return null;

  const normalizedCareer = (careerGoal || '').trim().toLowerCase();
  const normalizedInterests = (interests || []).map((t) => String(t).trim().toLowerCase());
  const normalizedStrengths = (strengths || []).map((t) => String(t).trim().toLowerCase());

  const hasPreferences =
    normalizedCareer.length > 0 ||
    normalizedInterests.length > 0 ||
    normalizedStrengths.length > 0;

  // Score each task
  const scored = eligible.map((task) => {
    let score = 0;
    const taskTags = (task.tags || []).map((t) => t.toLowerCase());

    // 1. Career Goal match (+10 points)
    if (normalizedCareer) {
      if (
        taskTags.some(
          (t) => normalizedCareer.includes(t) || t.includes(normalizedCareer)
        )
      ) {
        score += 10;
      }
    }

    // 2. Interests match (+4 points per matched tag)
    for (const interest of normalizedInterests) {
      if (
        taskTags.some(
          (t) => t === interest || t.includes(interest) || interest.includes(t)
        )
      ) {
        score += 4;
      }
    }

    // 3. Strengths match (+3 points per matched tag)
    for (const strength of normalizedStrengths) {
      if (
        taskTags.some(
          (t) => t === strength || t.includes(strength) || strength.includes(t)
        )
      ) {
        score += 3;
      }
    }

    // Avoid repetitive recommendations if already suggested in an earlier gap today
    if (usedActivityIds.has(task.id)) {
      score -= 2;
    }

    return {
      task,
      score,
      isGeneral: Boolean(task.isGeneral),
    };
  });

  // Sort by score desc, then by duration desc (to maximize gap utility)
  scored.sort((a, b) => {
    if (hasPreferences) {
      if (b.score !== a.score) return b.score - a.score;
    } else {
      // Empty preferences: prioritize general activities first
      if (a.isGeneral !== b.isGeneral) return b.isGeneral ? 1 : -1;
    }
    return b.task.duration - a.task.duration;
  });

  const best = scored[0];
  if (!best) return null;

  // If user has preferences but no specific match (score <= 0), fallback to a fitting general task
  if (hasPreferences && best.score <= 0) {
    const generalBest = scored.find((s) => s.isGeneral);
    const chosen = generalBest ? generalBest.task : best.task;
    return {
      id: chosen.id,
      title: chosen.title,
      duration: chosen.duration,
      durationFormatted: formatDuration(chosen.duration),
      tags: chosen.tags,
      category: chosen.category,
      isGeneral: Boolean(chosen.isGeneral),
      isFallback: true,
    };
  }

  const chosen = best.task;
  return {
    id: chosen.id,
    title: chosen.title,
    duration: chosen.duration,
    durationFormatted: formatDuration(chosen.duration),
    tags: chosen.tags,
    category: chosen.category,
    isGeneral: Boolean(chosen.isGeneral),
    matchScore: best.score,
  };
}
