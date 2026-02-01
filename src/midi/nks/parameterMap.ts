/**
 * NKS Parameter Map
 * 
 * Maps DEViLBOX parameters to NKS structure
 * Organizes parameters into pages for hardware display
 */

import type { NKSParameter, NKSPage } from './types';
import { NKSParameterType, NKSSection } from './types';

/**
 * TB-303 Parameter Mapping
 * Organized into logical pages for Komplete Kontrol
 */
export const TB303_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Main Oscillator
  {
    id: 'tb303.cutoff',
    name: 'Cutoff',
    section: NKSSection.FILTER,
    type: NKSParameterType.FLOAT,
    min: 0,
    max: 1,
    defaultValue: 0.5,
    unit: '%',
    formatString: '%.0f%%',
    page: 0,
    index: 0,
    ccNumber: 74,
    isAutomatable: true,
  },
  {
    id: 'tb303.resonance',
    name: 'Resonance',
    section: NKSSection.FILTER,
    type: NKSParameterType.FLOAT,
    min: 0,
    max: 1,
    defaultValue: 0.5,
    unit: '%',
    formatString: '%.0f%%',
    page: 0,
    index: 1,
    ccNumber: 71,
    isAutomatable: true,
  },
  {
    id: 'tb303.envMod',
    name: 'Env Mod',
    section: NKSSection.FILTER,
    type: NKSParameterType.FLOAT,
    min: 0,
    max: 1,
    defaultValue: 0.5,
    unit: '%',
    formatString: '%.0f%%',
    page: 0,
    index: 2,
    ccNumber: 102,
    isAutomatable: true,
  },
  {
    id: 'tb303.decay',
    name: 'Decay',
    section: NKSSection.ENVELOPE,
    type: NKSParameterType.FLOAT,
    min: 0,
    max: 1,
    defaultValue: 0.5,
    unit: '%',
    formatString: '%.0f%%',
    page: 0,
    index: 3,
    ccNumber: 103,
    isAutomatable: true,
  },
  {
    id: 'tb303.accent',
    name: 'Accent',
    section: NKSSection.SYNTHESIS,
    type: NKSParameterType.FLOAT,
    min: 0,
    max: 1,
    defaultValue: 0.5,
    unit: '%',
    formatString: '%.0f%%',
    page: 0,
    index: 4,
    ccNumber: 104,
    isAutomatable: true,
  },
  {
    id: 'tb303.tuning',
    name: 'Tuning',
    section: NKSSection.SYNTHESIS,
    type: NKSParameterType.FLOAT,
    min: -1,
    max: 1,
    defaultValue: 0,
    unit: 'semi',
    formatString: '%.1f',
    page: 0,
    index: 5,
    ccNumber: 105,
    isAutomatable: true,
  },
  {
    id: 'tb303.waveform',
    name: 'Waveform',
    section: NKSSection.SYNTHESIS,
    type: NKSParameterType.SELECTOR,
    min: 0,
    max: 1,
    defaultValue: 0,
    valueStrings: ['Saw', 'Square'],
    page: 0,
    index: 6,
    ccNumber: 106,
    isAutomatable: true,
  },
  {
    id: 'tb303.volume',
    name: 'Volume',
    section: NKSSection.OUTPUT,
    type: NKSParameterType.FLOAT,
    min: 0,
    max: 1,
    defaultValue: 0.7,
    unit: 'dB',
    formatString: '%.1f',
    page: 0,
    index: 7,
    ccNumber: 7,
    isAutomatable: true,
  },

  // Page 1: Effects
  {
    id: 'tb303.distortion',
    name: 'Distortion',
    section: NKSSection.EFFECTS,
    type: NKSParameterType.FLOAT,
    min: 0,
    max: 1,
    defaultValue: 0,
    unit: '%',
    formatString: '%.0f%%',
    page: 1,
    index: 0,
    ccNumber: 94,
    isAutomatable: true,
  },
  {
    id: 'tb303.delay.time',
    name: 'Delay Time',
    section: NKSSection.EFFECTS,
    type: NKSParameterType.FLOAT,
    min: 0,
    max: 1,
    defaultValue: 0.375,
    unit: 'ms',
    formatString: '%.0f',
    page: 1,
    index: 1,
    ccNumber: 85,
    isAutomatable: true,
  },
  {
    id: 'tb303.delay.feedback',
    name: 'Delay Fdbk',
    section: NKSSection.EFFECTS,
    type: NKSParameterType.FLOAT,
    min: 0,
    max: 1,
    defaultValue: 0.4,
    unit: '%',
    formatString: '%.0f%%',
    page: 1,
    index: 2,
    ccNumber: 86,
    isAutomatable: true,
  },
  {
    id: 'tb303.delay.mix',
    name: 'Delay Mix',
    section: NKSSection.EFFECTS,
    type: NKSParameterType.FLOAT,
    min: 0,
    max: 1,
    defaultValue: 0.3,
    unit: '%',
    formatString: '%.0f%%',
    page: 1,
    index: 3,
    ccNumber: 87,
    isAutomatable: true,
  },
  {
    id: 'tb303.reverb.size',
    name: 'Reverb Size',
    section: NKSSection.EFFECTS,
    type: NKSParameterType.FLOAT,
    min: 0,
    max: 1,
    defaultValue: 0.5,
    unit: '%',
    formatString: '%.0f%%',
    page: 1,
    index: 4,
    ccNumber: 91,
    isAutomatable: true,
  },
  {
    id: 'tb303.reverb.mix',
    name: 'Reverb Mix',
    section: NKSSection.EFFECTS,
    type: NKSParameterType.FLOAT,
    min: 0,
    max: 1,
    defaultValue: 0.2,
    unit: '%',
    formatString: '%.0f%%',
    page: 1,
    index: 5,
    ccNumber: 92,
    isAutomatable: true,
  },
];

/**
 * Organize parameters into pages
 */
export function buildNKSPages(parameters: NKSParameter[]): NKSPage[] {
  const pageMap = new Map<number, NKSParameter[]>();
  
  // Group parameters by page
  for (const param of parameters) {
    if (!pageMap.has(param.page)) {
      pageMap.set(param.page, []);
    }
    pageMap.get(param.page)!.push(param);
  }
  
  // Sort parameters by index within each page
  const pages: NKSPage[] = [];
  for (const [pageNum, params] of pageMap.entries()) {
    params.sort((a, b) => a.index - b.index);
    
    pages.push({
      id: `page_${pageNum}`,
      name: getPageName(pageNum, params),
      parameters: params,
    });
  }
  
  // Sort pages by page number
  pages.sort((a, b) => {
    const aNum = parseInt(a.id.split('_')[1]);
    const bNum = parseInt(b.id.split('_')[1]);
    return aNum - bNum;
  });
  
  return pages;
}

/**
 * Generate page name from parameters
 */
function getPageName(pageNum: number, params: NKSParameter[]): string {
  // Use the most common section
  const sections = params.map(p => p.section);
  const sectionCounts = new Map<string, number>();
  
  for (const section of sections) {
    sectionCounts.set(section, (sectionCounts.get(section) || 0) + 1);
  }
  
  let maxSection = sections[0];
  let maxCount = 0;
  
  for (const [section, count] of sectionCounts.entries()) {
    if (count > maxCount) {
      maxSection = section as NKSSection;
      maxCount = count;
    }
  }
  
  return `${maxSection} ${pageNum + 1}`;
}

/**
 * Get parameter by ID
 */
export function getNKSParameter(id: string, parameters: NKSParameter[]): NKSParameter | undefined {
  return parameters.find(p => p.id === id);
}

/**
 * Format parameter value for display
 */
export function formatNKSValue(param: NKSParameter, value: number): string {
  switch (param.type) {
    case NKSParameterType.BOOLEAN:
      return value >= 0.5 ? 'On' : 'Off';
      
    case NKSParameterType.SELECTOR:
      if (param.valueStrings) {
        const index = Math.round(value * (param.valueStrings.length - 1));
        return param.valueStrings[index] || '';
      }
      return String(Math.round(value));
      
    case NKSParameterType.INT:
      return String(Math.round(value * (param.max - param.min) + param.min));
      
    case NKSParameterType.FLOAT:
    default: {
      const scaledValue = value * (param.max - param.min) + param.min;
      const formatted = param.formatString
        ? param.formatString.replace('%.0f', String(Math.round(scaledValue)))
                          .replace('%.1f', scaledValue.toFixed(1))
                          .replace('%.2f', scaledValue.toFixed(2))
        : scaledValue.toFixed(2);
      
      return param.unit ? `${formatted}${param.unit}` : formatted;
    }
  }
}

/**
 * TB-303 NKS Pages
 */
export const TB303_NKS_PAGES = buildNKSPages(TB303_NKS_PARAMETERS);
