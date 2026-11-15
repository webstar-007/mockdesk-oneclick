// One place to look up a subject ("section") by key. The built-in SSC CGL pattern comes first;
// subjects that only appear in exams added from the admin console are registered here too.
import examConfig from '../../config/exam.config.js';

let extra = {};
export const setExtraSections = (o) => { extra = o || {}; };
export const sectionDef = (k) => examConfig.sections[k] || extra[k];
export const allSectionKeys = () => [...Object.keys(examConfig.sections), ...Object.keys(extra).filter((k) => !examConfig.sections[k])];
export const allSections = () => Object.fromEntries(allSectionKeys().map((k) => [k, sectionDef(k)]));
