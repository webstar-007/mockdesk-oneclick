// ─────────────────────────────────────────────────────────────────────────────
// CENTRAL EXAM CONFIGURATION
// If SSC changes the Tier-II pattern, edit ONLY this file (and, for new
// mocks, config/mocks.config.js). Server grading, timers, the exam UI, the
// result analysis and the content validator all read from here.
//
// Pattern basis: SSC CGL 2026 notice, Paper-I (common to all posts):
//   Section-I   Maths (30) + Reasoning (30)      – 30 min sectional timer each
//   Section-II  English (45) + Gen. Awareness(25) – 40 min / 20 min
//   Section-III Computer Knowledge (20)           – 15 min
//   3 marks per question, 1 mark negative for every wrong answer.
//   Computer Knowledge is QUALIFYING ONLY: score >= 27 of 60 to qualify; its marks are not
//   added to the total (scored total = 130 questions, 390 marks).
// The Data Entry Speed Test (not objective) and the discipline papers
// (Paper-II Statistics, Paper-III Finance & Economics) are not simulated.
// Verify against the latest SSC notice before every new exam cycle.
// ─────────────────────────────────────────────────────────────────────────────

export default {
  exam: {
    id: 'ssc-cgl-t2',
    name: 'SSC CGL Tier-II · Paper-I',
    patternVersion: '2026',
    instructionsVersion: 1,
  },

  // Every subject ("section") in the paper.
  sections: {
    maths:     { name: 'Mathematical Abilities',            short: 'Maths',     questions: 30, marksPerQuestion: 3, negativeMarks: 1 },
    reasoning: { name: 'Reasoning & General Intelligence',  short: 'Reasoning', questions: 30, marksPerQuestion: 3, negativeMarks: 1 },
    english:   { name: 'English Language & Comprehension',  short: 'English',   questions: 45, marksPerQuestion: 3, negativeMarks: 1 },
    ga:        { name: 'General Awareness',                 short: 'GA',        questions: 25, marksPerQuestion: 3, negativeMarks: 1 },
    // Qualifying paper: marks are shown separately and are NOT added to the total score.
    // A candidate qualifies by scoring at least qualifyingMarks in this section.
    computer:  { name: 'Computer Knowledge',                short: 'Computer',  questions: 20, marksPerQuestion: 3, negativeMarks: 1, qualifying: true, qualifyingMarks: 27 },
  },

  // Timed segments, in order. A segment is a block with ONE countdown.
  //  • sectional pattern (2026): one section per segment, locked after time ends
  //  • overall pattern (older):  one segment listing all sections, e.g.
  //      { id: 'all', sections: ['maths','reasoning','english','ga'], minutes: 135 }
  // Candidates cannot return to a previous segment once it ends.
  segments: [
    { id: 'maths',     sections: ['maths'],     minutes: 30 },
    { id: 'reasoning', sections: ['reasoning'], minutes: 30 },
    { id: 'english',   sections: ['english'],   minutes: 40 },
    { id: 'ga',        sections: ['ga'],        minutes: 20 },
    { id: 'computer',  sections: ['computer'],  minutes: 15 },
  ],

  // Question palette status keys (labels used by exam + legend)
  statuses: {
    notVisited:      'Not Visited',
    notAnswered:     'Not Answered',
    answered:        'Answered',
    marked:          'Marked for Review',
    answeredMarked:  'Answered & Marked for Review',
  },

  // How many options each question has / allowed difficulty labels
  optionsPerQuestion: 4,
  difficulties: ['easy', 'moderate', 'hard'],

  // Target difficulty mix per mock level (used by the content validator)
  difficultyMix: {
    moderate: { easy: 0.25, moderate: 0.55, hard: 0.20 },
    hard:     { easy: 0.10, moderate: 0.40, hard: 0.50 },
  },

  // Autosave cadence (ms) and clock-sync tolerance
  autosaveMs: 10000,
  // Warn the candidate when this many seconds remain in a segment
  lowTimeWarningSeconds: 300,
};
