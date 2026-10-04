export type CambridgeSyllabus = { code: string; name: string };

export type CambridgeTimetableSeries = {
  id: string;
  label: string;
  syllabusCodes: string[];
};

export declare const CAMBRIDGE_SYLLABUSES: CambridgeSyllabus[];
export declare const CAMBRIDGE_TIMETABLE_SERIES: CambridgeTimetableSeries[];
export declare function getCambridgeSyllabusName(code: string): string | null;
