/**
 * AI Field Matcher Service
 * 
 * Uses AI to understand any form field and return the appropriate value
 * from the user's profile. Includes hardcoded mappings for common fields
 * and falls back to AI for complex/unknown fields.
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
    source: 'hardcoded' | 'ai' | 'fuzzy';
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
        return { value: hardcodedMatch, confidence: 'high', source: 'hardcoded' };
    }

    // 2. If dropdown, try fuzzy matching against user values
    if (field.type === 'select' && field.options && field.options.length > 0) {
        const fuzzyMatch = tryFuzzyDropdownMatch(field, user);
        if (fuzzyMatch !== null) {
            return { value: fuzzyMatch, confidence: 'medium', source: 'fuzzy' };
        }
    }

    // 3. Fall back to AI for complex/unknown fields
    const aiMatch = await getAIMatch(field, user);
    return { value: aiMatch, confidence: 'low', source: 'ai' };
};

/**
 * Hardcoded mappings for common form fields
 * Uses regex patterns to match field labels
 */
function tryHardcodedMatch(field: FormField, user: IUser): string | boolean | null {
    const label = (field.label + ' ' + (field.placeholder || '') + ' ' + (field.name || '')).toLowerCase();

    // Personal Details
    if (/first.*name/i.test(label)) return user.name?.split(' ')[0] || '';
    if (/last.*name/i.test(label)) return user.name?.split(' ').slice(1).join(' ') || '';
    if (/full.*name|your.*name/i.test(label)) return user.name || '';
    if (/email/i.test(label)) return user.email || '';
    if (/phone|mobile|cell/i.test(label)) return user.personalDetails?.phone || '';
    if (/address|street/i.test(label)) return user.personalDetails?.address || '';
    if (/city/i.test(label)) return user.personalDetails?.city || '';
    if (/state|province/i.test(label)) return user.personalDetails?.state || '';
    if (/zip|postal/i.test(label)) return user.personalDetails?.zip || '';
    if (/linkedin/i.test(label)) return user.personalDetails?.linkedin || '';
    if (/github/i.test(label)) return user.personalDetails?.github || '';
    if (/portfolio|website/i.test(label)) return user.personalDetails?.portfolio || '';

    // Education
    if (/university|school|college|institution/i.test(label)) return user.personalDetails?.university || user.structuredExperience?.education?.[0]?.institution || '';
    if (/degree/i.test(label)) return user.personalDetails?.degree || user.structuredExperience?.education?.[0]?.degree || '';
    if (/gpa|grade.*point/i.test(label)) return user.personalDetails?.gpa || user.structuredExperience?.education?.[0]?.gpa || '';
    if (/major|field.*study|discipline/i.test(label)) return user.structuredExperience?.education?.[0]?.coursework || '';
    if (/graduation.*year|grad.*year/i.test(label)) return user.personalDetails?.gradYear || String(user.gradYear) || '';

    // Demographics
    if (/gender|sex\b/i.test(label)) return user.demographics?.gender || '';
    if (/race|ethnicity/i.test(label)) return user.demographics?.race || '';
    if (/veteran/i.test(label)) return user.demographics?.veteran || '';
    if (/disability|disabilities/i.test(label)) return user.demographics?.disability || '';
    if (/hispanic|latino/i.test(label)) return user.demographics?.hispanicLatino || 'No';

    // Work Authorization
    if (/work.*auth|authorized.*work|legally.*work/i.test(label)) return user.commonReplies?.workAuth || 'Yes';
    if (/sponsor|visa.*sponsor/i.test(label)) return user.commonReplies?.sponsorship || 'No';
    if (/relocat/i.test(label)) return user.commonReplies?.relocation || 'Yes';
    if (/former.*employee|previously.*employ|worked.*before/i.test(label)) return user.additionalAnswers?.previouslyEmployedHere || 'No';

    // Authorization/Consent
    if (/contact.*employer|contact.*current/i.test(label)) return user.additionalAnswers?.canContactEmployer || 'Yes';
    if (/perform.*function|essential.*function/i.test(label)) return user.additionalAnswers?.canPerformFunctions || 'Yes';
    if (/accommodation/i.test(label)) return user.additionalAnswers?.accommodationNeeds || '';
    if (/proximity|commut|office.*location/i.test(label)) return user.additionalAnswers?.proximityToOffice || 'Yes';
    if (/certify|truthful|accurate|signature/i.test(label)) {
        // Auto-generate signature
        const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        return `${user.name} - ${today}`;
    }

    // Custom/Misc
    if (/pronoun/i.test(label)) return user.customAnswers?.pronouns || '';
    if (/how.*hear|source|referral/i.test(label)) return user.essayAnswers?.howDidYouHear || 'LinkedIn';
    if (/why.*join|why.*excit|why.*interest|why.*want/i.test(label)) return user.essayAnswers?.whyExcited || '';

    // Checkboxes - typically consent boxes, default to true
    if (field.type === 'checkbox') {
        if (/agree|consent|certify|acknowledge|confirm/i.test(label)) return true;
    }

    return null; // No match found
}

/**
 * Fuzzy match dropdown options against user's stored values
 * Uses Levenshtein distance / includes matching
 */
function tryFuzzyDropdownMatch(field: FormField, user: IUser): string | null {
    if (!field.options || field.options.length === 0) return null;

    const label = field.label.toLowerCase();
    let userValue = '';

    // Determine which user value to match against
    if (/gender/i.test(label)) userValue = user.demographics?.gender || '';
    else if (/race|ethnicity/i.test(label)) userValue = user.demographics?.race || '';
    else if (/veteran/i.test(label)) userValue = user.demographics?.veteran || '';
    else if (/disability/i.test(label)) userValue = user.demographics?.disability || '';
    else if (/hispanic|latino/i.test(label)) userValue = user.demographics?.hispanicLatino || '';
    else if (/degree/i.test(label)) userValue = user.personalDetails?.degree || '';
    else if (/school|university/i.test(label)) userValue = user.personalDetails?.university || '';
    else return null;

    if (!userValue) return null;

    // Find best matching option
    const userValueLower = userValue.toLowerCase();

    // Exact match
    const exactMatch = field.options.find(opt => opt.toLowerCase() === userValueLower);
    if (exactMatch) return exactMatch;

    // Contains match
    const containsMatch = field.options.find(opt =>
        opt.toLowerCase().includes(userValueLower) ||
        userValueLower.includes(opt.toLowerCase())
    );
    if (containsMatch) return containsMatch;

    // Partial word match
    const words = userValueLower.split(/\s+/);
    const wordMatch = field.options.find(opt =>
        words.some(word => word.length > 2 && opt.toLowerCase().includes(word))
    );
    if (wordMatch) return wordMatch;

    return null;
}

/**
 * AI-based matching for complex/unknown fields
 * Uses OpenRouter to understand the field and generate appropriate value
 */
async function getAIMatch(field: FormField, user: IUser): Promise<string> {
    const prompt = `
You are helping fill out a job application form. Given the following form field and candidate information, return ONLY the value to fill in. No explanation.

FORM FIELD:
- Label: "${field.label}"
- Type: ${field.type}
- Required: ${field.isRequired}
${field.options ? `- Options: ${field.options.join(', ')}` : ''}
${field.placeholder ? `- Placeholder: "${field.placeholder}"` : ''}

CANDIDATE INFO:
- Name: ${user.name}
- Email: ${user.email}
- Phone: ${user.personalDetails?.phone || 'N/A'}
- Location: ${user.personalDetails?.city || ''}, ${user.personalDetails?.state || ''} ${user.personalDetails?.zip || ''}
- University: ${user.personalDetails?.university || 'N/A'}
- Degree: ${user.personalDetails?.degree || 'N/A'}
- Gender: ${user.demographics?.gender || 'N/A'}
- Race: ${user.demographics?.race || 'N/A'}
- Veteran Status: ${user.demographics?.veteran || 'N/A'}
- Disability: ${user.demographics?.disability || 'N/A'}
- Work Authorization: ${user.commonReplies?.workAuth || 'Yes'}
- Needs Sponsorship: ${user.commonReplies?.sponsorship || 'No'}
- Open to Relocation: ${user.commonReplies?.relocation || 'Yes'}

${field.options ? 'Return EXACTLY one of the options listed above.' : 'Return an appropriate value for this field.'}
Return ONLY the value, nothing else.
`;

    try {
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'mistralai/mistral-small-3.1-24b-instruct:free',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 50,
                temperature: 0.1 // Low temp for deterministic output
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
        return ''; // Return empty on failure
    }
}

/**
 * Get employment entry by index (for filling multiple employment sections)
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
        // Parse dates from "Month Year - Month Year" format
        const dateMatch = exp.dates?.match(/(\w+)\s+(\d{4})\s*[-–]\s*(\w+)?\s*(\d{4}|Present)?/i);
        return {
            company: exp.company || '',
            title: exp.role || '',
            startMonth: dateMatch?.[1] || '',
            startYear: dateMatch?.[2] || '',
            endMonth: dateMatch?.[3] || '',
            endYear: dateMatch?.[4] === 'Present' ? '' : (dateMatch?.[4] || ''),
            isCurrent: /present|current/i.test(exp.dates || '')
        };
    }

    return null;
}

/**
 * Get education entry by index (for filling multiple education sections)
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
        // Parse dates from "Month Year - Month Year" or "Year - Year" format
        const dateMatch = edu.dates?.match(/(\d{4})\s*[-–]\s*(\d{4}|Present)?/i);
        return {
            school: edu.institution || user.personalDetails?.university || '',
            degree: edu.degree || user.personalDetails?.degree || '',
            field: edu.coursework || '',
            startYear: dateMatch?.[1] || '',
            endYear: dateMatch?.[2] === 'Present' ? '' : (dateMatch?.[2] || '')
        };
    }

    // If no structured data, use personalDetails as single entry
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
    getEmploymentEntry,
    getEducationEntry
};
