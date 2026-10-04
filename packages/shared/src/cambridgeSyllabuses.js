/**
 * Cambridge International AS & A Level syllabuses that have timetabled
 * (key-time) components, taken from the June 2026 and Nov 2026 zone
 * timetables (docs/channel-locking-research/cambridge_2026_timetables_parsed.csv).
 * 8xxx codes are AS Level only; 9xxx are AS & A Level.
 *
 * Syllabuses with only windowed components (art, coursework) are left out:
 * they have no key time, so exam locking never covers them.
 */

const CAMBRIDGE_SYLLABUSES = [
  { code: "8021", name: "English General Paper" },
  { code: "8022", name: "Spanish Language" },
  { code: "8027", name: "German Language" },
  { code: "8028", name: "French Language" },
  { code: "8238", name: "Chinese Language" },
  { code: "8291", name: "Environmental Management" },
  { code: "8386", name: "Sport & Physical Education" },
  { code: "8679", name: "Afrikaans Language" },
  { code: "8680", name: "Arabic Language" },
  { code: "8684", name: "Portuguese Language" },
  { code: "8686", name: "Urdu Language" },
  { code: "8689", name: "Tamil Language" },
  { code: "8695", name: "Language & Literature in English" },
  { code: "9084", name: "Law" },
  { code: "9093", name: "English Language" },
  { code: "9231", name: "Further Mathematics" },
  { code: "9239", name: "Global Perspectives & Research" },
  { code: "9274", name: "Classical Studies" },
  { code: "9395", name: "Travel & Tourism" },
  { code: "9482", name: "Drama" },
  { code: "9483", name: "Music" },
  { code: "9484", name: "Biblical Studies" },
  { code: "9487", name: "Hinduism" },
  { code: "9488", name: "Islamic Studies" },
  { code: "9489", name: "History" },
  { code: "9607", name: "Media Studies" },
  { code: "9609", name: "Business" },
  { code: "9618", name: "Computer Science" },
  { code: "9626", name: "Information Technology" },
  { code: "9680", name: "Arabic" },
  { code: "9686", name: "Urdu" },
  { code: "9689", name: "Tamil" },
  { code: "9693", name: "Marine Science" },
  { code: "9694", name: "Thinking Skills" },
  { code: "9695", name: "Literature in English" },
  { code: "9696", name: "Geography" },
  { code: "9699", name: "Sociology" },
  { code: "9700", name: "Biology" },
  { code: "9701", name: "Chemistry" },
  { code: "9702", name: "Physics" },
  { code: "9705", name: "Design & Technology" },
  { code: "9706", name: "Accounting" },
  { code: "9708", name: "Economics" },
  { code: "9709", name: "Mathematics" },
  { code: "9718", name: "Portuguese" },
  { code: "9844", name: "Spanish Language & Literature" },
  { code: "9868", name: "Chinese Language & Literature" },
  { code: "9897", name: "German Language & Literature" },
  { code: "9898", name: "French Language & Literature" },
  { code: "9990", name: "Psychology" },
];

/**
 * A Level syllabuses sat in each series, newest first. Used to pre-fill the
 * Exam subjects page and to warn about timetabled syllabuses with no subject.
 */
const CAMBRIDGE_TIMETABLE_SERIES = [
  {
    id: "november-2026",
    label: "Nov 2026",
    syllabusCodes: [
      "8021", "8022", "8027", "8028", "8238", "8291", "8386", "8679", "8680",
      "8695", "9084", "9093", "9231", "9239", "9274", "9395", "9482", "9483",
      "9484", "9487", "9489", "9607", "9609", "9618", "9626", "9680", "9686",
      "9693", "9694", "9695", "9696", "9699", "9700", "9701", "9702", "9705",
      "9706", "9708", "9709", "9844", "9868", "9897", "9990",
    ],
  },
  {
    id: "june-2026",
    label: "June 2026",
    syllabusCodes: [
      "8021", "8022", "8027", "8028", "8238", "8291", "8386", "8680", "8684",
      "8686", "8689", "8695", "9084", "9093", "9231", "9239", "9395", "9482",
      "9483", "9484", "9487", "9488", "9489", "9607", "9609", "9618", "9626",
      "9680", "9686", "9689", "9693", "9694", "9695", "9696", "9699", "9700",
      "9701", "9702", "9705", "9706", "9708", "9709", "9718", "9844", "9868",
      "9897", "9898", "9990",
    ],
  },
];

const SYLLABUS_BY_CODE = new Map(CAMBRIDGE_SYLLABUSES.map((s) => [s.code, s]));

/** "9709" -> "Mathematics", or null for a code not in the list. */
function getCambridgeSyllabusName(code) {
  return SYLLABUS_BY_CODE.get(String(code ?? "").trim())?.name ?? null;
}

module.exports = {
  CAMBRIDGE_SYLLABUSES,
  CAMBRIDGE_TIMETABLE_SERIES,
  getCambridgeSyllabusName,
};
