/**
 * AI Field Matcher Service v2.0
 * 
 * Significantly improved: better fuzzy matching, similarity scoring,
 * more hardcoded patterns, and smarter dropdown option selection.
 */

import axios from 'axios';
import { IUser } from '../models/User.schema';

// Form field types detected by Playwright
export interface FormField {
    type: 'input' | 'select' | 'textarea' | 'checkbox' | 'radio';
    label: string;
    placeholder?: string;
    options?: string[];  // For dropdowns/radios
    isRequired: boolean;
    name?: string;       // HTML name attribute
    id?: string;         // HTML id attribute
}

// Result from matching
export interface MatchResult {
    value: string | boolean;
    confidence: 'high' | 'medium' | 'low';
    source: 'hardcoded' | 'ai' | 'fuzzy' | 'similarity';
}

/**
 * Calculate similarity between two strings (0-1)
 */
function stringSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    if (s1 === s2) return 1;
    if (s1.length === 0 || s2.length === 0) return 0;

    // Check if one contains the other
    if (s1.includes(s2) || s2.includes(s1)) {
        return 0.8;
    }

    // Word overlap score
    const words1 = s1.split(/\s+/).filter(w => w.length > 2);
    const words2 = s2.split(/\s+/).filter(w => w.length > 2);

    let matchingWords = 0;
    for (const w1 of words1) {
        if (words2.some(w2 => w2.includes(w1) || w1.includes(w2))) {
            matchingWords++;
        }
    }

    const wordScore = matchingWords / Math.max(words1.length, words2.length, 1);

    // Levenshtein-like character match
    let charMatches = 0;
    for (let i = 0; i < Math.min(s1.length, s2.length); i++) {
        if (s1[i] === s2[i]) charMatches++;
    }
    const charScore = charMatches / Math.max(s1.length, s2.length);

    return Math.max(wordScore, charScore);
}

/**
 * Find the best matching option from a dropdown using similarity scoring
 */
export function findBestOption(options: string[], targetValue: string): { option: string; score: number } | null {
    if (!options || options.length === 0 || !targetValue) return null;

    const target = targetValue.toLowerCase().trim();
    let best: { option: string; score: number } | null = null;

    for (const opt of options) {
        const optLower = opt.toLowerCase().trim();

        // Skip placeholder options
        if (optLower === 'select...' || optLower === 'select' || optLower === 'choose...' || optLower === '' || optLower === '--') {
            continue;
        }

        // Calculate similarity
        let score = stringSimilarity(optLower, target);

        // Boost score for key matches
        if (optLower === target) score = 1;
        else if (optLower.startsWith(target) || target.startsWith(optLower)) score = Math.max(score, 0.9);
        else if (optLower.includes(target) || target.includes(optLower)) score = Math.max(score, 0.75);

        // Special handling for common patterns
        // Gender
        if (/\b(male|man)\b/i.test(target) && /\b(male|man)\b/i.test(optLower)) score = 0.95;
        if (/\b(female|woman)\b/i.test(target) && /\b(female|woman)\b/i.test(optLower)) score = 0.95;

        // Yes/No patterns
        if (/^yes\b/i.test(target) && /^yes\b/i.test(optLower)) score = 0.95;
        if (/^no\b/i.test(target) && /^no\b/i.test(optLower)) score = 0.95;

        // Race/ethnicity
        if (/black|african/i.test(target) && /black|african/i.test(optLower)) score = 0.95;
        if (/white|caucasian/i.test(target) && /white|caucasian/i.test(optLower)) score = 0.95;
        if (/asian/i.test(target) && /asian/i.test(optLower)) score = 0.9;
        if (/hispanic|latino/i.test(target) && /hispanic|latino/i.test(optLower)) score = 0.9;

        // Veteran
        if (/not.*veteran|no.*veteran/i.test(target) && /not.*veteran|no.*veteran/i.test(optLower)) score = 0.95;
        if (/am.*veteran|yes.*veteran/i.test(target) && /am.*veteran|yes.*veteran/i.test(optLower)) score = 0.95;

        // Disability
        if (/no.*disab|don.*have.*disab/i.test(target) && /no.*disab|don.*have.*disab/i.test(optLower)) score = 0.95;
        if (/yes.*disab|have.*disab/i.test(target) && /yes.*disab|have.*disab/i.test(optLower)) score = 0.95;

        if (!best || score > best.score) {
            best = { option: opt, score };
        }
    }

    // Only return if we have a decent match
    return best && best.score >= 0.5 ? best : null;
}

/**
 * Main entry point: Given a form field and user profile, return the value to fill
 */
export const matchFieldValue = async (
    field: FormField,
    user: IUser
): Promise<MatchResult> => {
    // 1. Try hardcoded mappings first (fastest, most reliable)
    const hardcodedMatch = tryHardcodedMatch(field, user);
    if (hardcodedMatch !== null) {
        // If it's a dropdown, find the best matching option
        if (field.type === 'select' && field.options && typeof hardcodedMatch === 'string') {
            const bestOpt = findBestOption(field.options, hardcodedMatch);
            if (bestOpt) {
                return { value: bestOpt.option, confidence: 'high', source: 'similarity' };
            }
        }
        return { value: hardcodedMatch, confidence: 'high', source: 'hardcoded' };
    }

    // 2. If dropdown, try fuzzy matching with similarity scoring
    if (field.type === 'select' && field.options && field.options.length > 0) {
        const fuzzyMatch = tryFuzzyDropdownMatch(field, user);
        if (fuzzyMatch !== null) {
            return { value: fuzzyMatch, confidence: 'medium', source: 'fuzzy' };
        }
    }

    // 3. Fall back to AI for complex/unknown fields
    const aiMatch = await getAIMatch(field, user);

    // If AI returned a value and it's a dropdown, find the best option
    if (aiMatch && field.type === 'select' && field.options) {
        const bestOpt = findBestOption(field.options, aiMatch);
        if (bestOpt) {
            return { value: bestOpt.option, confidence: 'medium', source: 'ai' };
        }
    }

    return { value: aiMatch, confidence: 'low', source: 'ai' };
};

/**
 * Hardcoded mappings for common form fields - EXPANDED
 * Uses regex patterns to match field labels
 */
function tryHardcodedMatch(field: FormField, user: IUser): string | boolean | null {
    const label = (field.label + ' ' + (field.placeholder || '') + ' ' + (field.name || '') + ' ' + (field.id || '')).toLowerCase();

    // === PERSONAL DETAILS ===
    if (/first.*name|given.*name|forename/i.test(label)) return user.name?.split(' ')[0] || '';
    if (/last.*name|family.*name|surname/i.test(label)) return user.name?.split(' ').slice(1).join(' ') || '';
    if (/full.*name|your.*name|legal.*name/i.test(label)) return user.name || '';
    if (/email/i.test(label)) return user.email || '';
    if (/phone|mobile|cell|telephone/i.test(label)) return user.personalDetails?.phone || '';
    if (/address|street/i.test(label) && !/email/i.test(label)) return user.personalDetails?.address || '';
    if (/\bcity\b|location.*city/i.test(label)) return user.personalDetails?.city || '';
    if (/\bstate\b|province|region/i.test(label) && !/united states/i.test(label)) return user.personalDetails?.state || '';
    if (/\bzip\b|postal.*code/i.test(label)) return user.personalDetails?.zip || '';
    if (/\bcountry\b/i.test(label)) return 'United States';
    if (/linkedin/i.test(label)) return user.personalDetails?.linkedin || '';
    if (/github/i.test(label)) return user.personalDetails?.github || '';
    if (/portfolio|website|personal.*site/i.test(label)) return user.personalDetails?.portfolio || '';

    // === EDUCATION ===
    if (/university|school|college|institution|alma.*mater/i.test(label)) return user.personalDetails?.university || user.structuredExperience?.education?.[0]?.institution || '';
    if (/\bdegree\b/i.test(label)) return user.personalDetails?.degree || user.structuredExperience?.education?.[0]?.degree || '';
    if (/gpa|grade.*point/i.test(label)) return user.personalDetails?.gpa || user.structuredExperience?.education?.[0]?.gpa || '';
    if (/major|field.*study|discipline|concentration/i.test(label)) {
        return user.structuredExperience?.education?.[0]?.coursework || user.personalDetails?.degree?.split(' in ')?.[1] || '';
    }
    if (/graduation.*year|grad.*year|expected.*graduation/i.test(label)) return user.personalDetails?.gradYear || String(user.gradYear) || '';
    if (/graduation.*month|grad.*month/i.test(label)) return user.personalDetails?.gradMonth || '';

    // === DEMOGRAPHICS (EEO) - NO DEFAULTS, use profile only ===
    if (/\bgender\b|\bsex\b/i.test(label) && !/pronoun/i.test(label)) return user.demographics?.gender || '';
    if (/\brace\b|ethnicity/i.test(label) && !/hispanic/i.test(label)) return user.demographics?.race || '';
    if (/veteran/i.test(label)) return user.demographics?.veteran || '';
    if (/disability|disabilities/i.test(label)) return user.demographics?.disability || '';
    if (/hispanic|latino/i.test(label)) return user.demographics?.hispanicLatino || '';

    // === WORK AUTHORIZATION - use profile values only ===
    if (/work.*auth|authorized.*work|legally.*work|eligible.*work|lawfully.*work/i.test(label)) return user.commonReplies?.workAuth || '';
    if (/sponsor|visa.*sponsor|require.*sponsor|need.*sponsor/i.test(label)) return user.commonReplies?.sponsorship || '';
    if (/relocat|willing.*move|open.*relocat/i.test(label)) return user.commonReplies?.relocation || '';
    if (/commut|proximity|reside.*near|live.*near|based.*in/i.test(label)) return user.additionalAnswers?.proximityToOffice || '';

    // === EMPLOYMENT HISTORY RELATED - use profile values ===
    if (/former.*employee|previously.*employ|worked.*here.*before|employed.*by.*before|employed.*by.*past/i.test(label)) return user.commonReplies?.formerEmployee || user.additionalAnswers?.previouslyEmployedHere || '';
    if (/current.*employer|may.*we.*contact|contact.*current.*employer/i.test(label)) return user.additionalAnswers?.canContactEmployer || '';

    // === CONSENT & LEGAL - use profile values ===
    if (/perform.*essential.*function|can.*you.*perform|able.*to.*perform/i.test(label)) return user.additionalAnswers?.canPerformFunctions || '';
    if (/reasonable.*accommodation|accommodation.*need|need.*accommodation/i.test(label)) return user.additionalAnswers?.accommodationNeeds || '';
    if (/review.*linked.*document|privacy.*policy|reviewed.*policy/i.test(label)) return user.additionalAnswers?.certifyTruthful ? 'Yes' : '';
    if (/certify|truthful|accurate|attest|acknowledge.*true/i.test(label)) {
        // Auto-generate signature
        const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        return `${user.name} - ${today}`;
    }
    if (/electronic.*signature|sign.*name|full.*name.*date/i.test(label)) {
        const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        return `${user.name} - ${today}`;
    }

    // === PRONOUNS - use profile value only ===
    if (/pronoun/i.test(label)) return user.customAnswers?.pronouns || '';

    // === REFERRAL/SOURCE - use profile value only ===
    if (/how.*hear|source|referral|where.*find|discover.*position|learn.*about/i.test(label)) return user.essayAnswers?.howDidYouHear || '';

    // === WHY INTERESTED ===
    if (/why.*join|why.*excit|why.*interest|why.*want|interest.*in.*position|motivation/i.test(label)) return user.essayAnswers?.whyExcited || '';

    // === CHECKBOXES ===
    if (field.type === 'checkbox') {
        if (/agree|consent|certify|acknowledge|confirm|accept|terms|privacy/i.test(label)) return true;
        if (/current.*role|currently.*work|present/i.test(label)) return false; // Usually "is this your current role?"
    }

    return null; // No match found
}

/**
 * Fuzzy match dropdown options against user's stored values
 * Now uses similarity scoring for better matches
 */
function tryFuzzyDropdownMatch(field: FormField, user: IUser): string | null {
    if (!field.options || field.options.length === 0) return null;

    const label = field.label.toLowerCase();
    let userValue = '';

    // Determine which user value to match against based on label - NO DEFAULTS
    if (/\bgender\b/i.test(label) && !/pronoun/i.test(label)) userValue = user.demographics?.gender || '';
    else if (/\brace\b|ethnicity/i.test(label) && !/hispanic/i.test(label)) userValue = user.demographics?.race || '';
    else if (/veteran/i.test(label)) userValue = user.demographics?.veteran || '';
    else if (/disability/i.test(label)) userValue = user.demographics?.disability || '';
    else if (/hispanic|latino/i.test(label)) userValue = user.demographics?.hispanicLatino || '';
    else if (/\bdegree\b/i.test(label)) userValue = user.personalDetails?.degree || '';
    else if (/school|university|institution/i.test(label)) userValue = user.personalDetails?.university || '';
    else if (/discipline|major|field.*study/i.test(label)) userValue = user.structuredExperience?.education?.[0]?.coursework || '';
    else if (/pronoun/i.test(label)) userValue = user.customAnswers?.pronouns || '';
    else if (/work.*auth|authorized/i.test(label)) userValue = user.commonReplies?.workAuth || '';
    else if (/sponsor/i.test(label)) userValue = user.commonReplies?.sponsorship || '';
    else if (/relocat|commut|proximity/i.test(label)) userValue = user.commonReplies?.relocation || '';
    else if (/may.*contact|contact.*employer/i.test(label)) userValue = user.additionalAnswers?.canContactEmployer || '';
    else if (/perform.*function|essential.*function/i.test(label)) userValue = user.additionalAnswers?.canPerformFunctions || '';
    else if (/review.*document|privacy.*policy/i.test(label)) userValue = user.additionalAnswers?.certifyTruthful || '';
    else if (/employed.*before|worked.*here|former.*employee/i.test(label)) userValue = user.commonReplies?.formerEmployee || '';
    else if (/country/i.test(label)) userValue = 'United States'; // This one stays as default since all users are US-based
    else return null;

    if (!userValue) return null;

    // Use similarity scoring to find the best option
    const best = findBestOption(field.options, userValue);
    return best ? best.option : null;
}

/**
 * AI-based matching for complex/unknown fields
 * Uses OpenRouter to understand the field and generate appropriate value
 */
async function getAIMatch(field: FormField, user: IUser): Promise<string> {
    const prompt = `
You are helping fill out a job application form. Given the form field and candidate info, return ONLY the exact value to fill in.

FORM FIELD:
- Label: "${field.label}"
- Type: ${field.type}
- Required: ${field.isRequired}
${field.options ? `- Available Options: ["${field.options.slice(0, 15).join('", "')}"]` : ''}
${field.placeholder ? `- Placeholder: "${field.placeholder}"` : ''}

CANDIDATE INFO (from their profile - use EXACTLY these values):
- Name: ${user.name || 'Not provided'}
- Email: ${user.email || 'Not provided'}
- Phone: ${user.personalDetails?.phone || 'Not provided'}
- City: ${user.personalDetails?.city || 'Not provided'}
- State: ${user.personalDetails?.state || 'Not provided'}
- Zip: ${user.personalDetails?.zip || 'Not provided'}
- University: ${user.personalDetails?.university || 'Not provided'}
- Degree: ${user.personalDetails?.degree || 'Not provided'}
- Gender: ${user.demographics?.gender || 'Not provided'}
- Race: ${user.demographics?.race || 'Not provided'}
- Veteran Status: ${user.demographics?.veteran || 'Not provided'}
- Disability: ${user.demographics?.disability || 'Not provided'}
- Hispanic/Latino: ${user.demographics?.hispanicLatino || 'Not provided'}
- Work Authorization: ${user.commonReplies?.workAuth || 'Not provided'}
- Needs Sponsorship: ${user.commonReplies?.sponsorship || 'Not provided'}
- Open to Relocation: ${user.commonReplies?.relocation || 'Not provided'}
- Pronouns: ${user.customAnswers?.pronouns || 'Not provided'}
- How did you hear: ${user.essayAnswers?.howDidYouHear || 'Not provided'}

IMPORTANT: Only use values that are actually provided above. If a value says "Not provided", return empty string.
`;

    try {
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'mistralai/mistral-small-3.1-24b-instruct:free',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 100,
                temperature: 0.1
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const value = response.data.choices[0]?.message?.content?.trim() || '';
        console.log(`🤖 [AI_FIELD_MATCH] Field "${field.label}" → "${value}"`);
        return value;
    } catch (error: any) {
        console.error(`❌ [AI_FIELD_MATCH] Error matching field "${field.label}":`, error.message);
        return '';
    }
}

/**
 * Get employment entry by index - IMPROVED DATE PARSING
 */
export function getEmploymentEntry(user: IUser, index: number): {
    company: string;
    title: string;
    startMonth: string;
    startYear: string;
    endMonth: string;
    endYear: string;
    isCurrent: boolean;
} | null {
    // Try user.employment first (new format)
    if (user.employment && user.employment[index]) {
        return user.employment[index];
    }

    // Fall back to structuredExperience.experience (parsed from resume)
    const exp = user.structuredExperience?.experience?.[index];
    if (exp) {
        // Multiple date format parsing
        let startMonth = '', startYear = '', endMonth = '', endYear = '';
        const dates = exp.dates || '';

        // Format: "May 2023 - Aug 2023" or "May 2023 – Present"
        const format1 = dates.match(/(\w+)\s+(\d{4})\s*[-–]\s*(\w+)?\s*(\d{4}|Present)?/i);
        if (format1) {
            startMonth = format1[1] || '';
            startYear = format1[2] || '';
            endMonth = format1[3] || '';
            endYear = format1[4] === 'Present' ? '' : (format1[4] || '');
        }

        // Format: "05/2023 - 08/2023"
        const format2 = dates.match(/(\d{1,2})\/(\d{4})\s*[-–]\s*(\d{1,2})?\/(\d{4})?/);
        if (format2 && !format1) {
            const months = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            startMonth = months[parseInt(format2[1]) || 0] || '';
            startYear = format2[2] || '';
            endMonth = months[parseInt(format2[3]) || 0] || '';
            endYear = format2[4] || '';
        }

        // Format: "2023-05 to 2023-08" (ISO-ish)
        const format3 = dates.match(/(\d{4})-(\d{2})\s*(?:to|-)\s*(\d{4})?-?(\d{2})?/);
        if (format3 && !format1 && !format2) {
            const months = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            startYear = format3[1] || '';
            startMonth = months[parseInt(format3[2]) || 0] || '';
            endYear = format3[3] || '';
            endMonth = months[parseInt(format3[4]) || 0] || '';
        }

        return {
            company: exp.company || '',
            title: exp.role || '',
            startMonth,
            startYear,
            endMonth,
            endYear,
            isCurrent: /present|current/i.test(dates)
        };
    }

    return null;
}

/**
 * Get education entry by index
 */
export function getEducationEntry(user: IUser, index: number): {
    school: string;
    degree: string;
    field: string;
    startYear: string;
    endYear: string;
} | null {
    const edu = user.structuredExperience?.education?.[index];
    if (edu) {
        const dateMatch = edu.dates?.match(/(\d{4})\s*[-–]\s*(\d{4}|Present)?/i);
        return {
            school: edu.institution || user.personalDetails?.university || '',
            degree: edu.degree || user.personalDetails?.degree || '',
            field: edu.coursework || '',
            startYear: dateMatch?.[1] || '',
            endYear: dateMatch?.[2] === 'Present' ? '' : (dateMatch?.[2] || user.personalDetails?.gradYear || '')
        };
    }

    // Fallback to personalDetails
    if (index === 0 && user.personalDetails?.university) {
        return {
            school: user.personalDetails.university,
            degree: user.personalDetails.degree || '',
            field: '',
            startYear: '',
            endYear: user.personalDetails.gradYear || String(user.gradYear) || ''
        };
    }

    return null;
}

export default {
    matchFieldValue,
    findBestOption,
    getEmploymentEntry,
    getEducationEntry
};
