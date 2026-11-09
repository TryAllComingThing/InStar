import type { Requirement, Scenario } from '../../engine/artifacts/base.schema.js';
import type { Spec } from '../../engine/artifacts/spec.schema.js';
import { buildCodeFenceMask, extractRequirementText, hasScenarioBody, isScenarioTitle } from './requirement-text.js';
import { normalizeRequirementName, scenarioNameFromHeaderText } from './requirement-blocks.js';

interface Section {
  level: number;
  title: string;
  content: string;
  children: Section[];
}

export class MarkdownParser {
  private lines: string[];
  private codeFenceLineMask: boolean[];

  constructor(content: string) {
    const normalized = MarkdownParser.normalizeContent(content);
    this.lines = normalized.split('\n');
    this.codeFenceLineMask = buildCodeFenceMask(this.lines);
  }

  protected static normalizeContent(content: string): string {
    // Strip a UTF-8 BOM so a header on the first line still matches.
    return content.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  }

  parseSpec(name: string): Spec {
    const sections = this.parseSections();
    const purpose = this.findSection(sections, 'Purpose')?.content || '';
    
    const requirementsSection = this.findSection(sections, 'Requirements');
    
    if (!purpose) {
      throw new Error('Spec must have a Purpose section');
    }
    
    if (!requirementsSection) {
      throw new Error('Spec must have a Requirements section');
    }

    const requirements = this.parseRequirements(requirementsSection);

    return {
      name,
      overview: purpose.trim(),
      requirements,
      metadata: {
        version: '1.0.0',
        format: 'openspec',
      },
    };
  }

  protected parseSections(): Section[] {
    const sections: Section[] = [];
    const stack: Section[] = [];
    
    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i];
      if (this.codeFenceLineMask[i]) {
        continue;
      }
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
      
      if (headerMatch) {
        const level = headerMatch[1].length;
        const title = headerMatch[2].trim();
        const content = this.getContentUntilNextHeader(i + 1, level);
        
        const section: Section = {
          level,
          title,
          content,
          children: [],
        };

        while (stack.length > 0 && stack[stack.length - 1].level >= level) {
          stack.pop();
        }

        if (stack.length === 0) {
          sections.push(section);
        } else {
          stack[stack.length - 1].children.push(section);
        }
        
        stack.push(section);
      }
    }
    
    return sections;
  }

  protected getContentUntilNextHeader(startLine: number, currentLevel: number): string {
    const contentLines: string[] = [];
    
    for (let i = startLine; i < this.lines.length; i++) {
      const line = this.lines[i];
      const headerMatch = this.codeFenceLineMask[i] ? null : line.match(/^(#{1,6})\s+/);
      
      if (headerMatch && headerMatch[1].length <= currentLevel) {
        break;
      }
      
      contentLines.push(line);
    }
    
    return contentLines.join('\n').trim();
  }

  protected findSection(sections: Section[], title: string): Section | undefined {
    for (const section of sections) {
      if (section.title.toLowerCase() === title.toLowerCase()) {
        return section;
      }
      const child = this.findSection(section.children, title);
      if (child) {
        return child;
      }
    }
    return undefined;
  }

  protected parseRequirements(section: Section): Requirement[] {
    const requirements: Requirement[] = [];

    for (const child of section.children) {
      // Read the requirement text via the shared reader (multi-line, fence- and
      // metadata-aware, with the shared header-title fallback for empty bodies).
      const text = extractRequirementText(child.title, child.content.split('\n'));

      const scenarios = this.parseScenarios(child);

      requirements.push({
        // The name archive matches on, so a JSON reader can cite a requirement
        // the way a MODIFIED or REMOVED header must.
        name: normalizeRequirementName(child.title.replace(/^Requirement:\s*/i, '')),
        text,
        scenarios,
      });
    }

    return requirements;
  }

  protected parseScenarios(requirementSection: Section): Scenario[] {
    const scenarios: Scenario[] = [];
    
    for (const scenarioSection of requirementSection.children) {
      // Store the raw text content of the scenario section. A header with no
      // body is not a scenario; the delta counter applies the same rule.
      if (isScenarioTitle(scenarioSection.title) && hasScenarioBody(scenarioSection.content)) {
        scenarios.push({
          name: scenarioNameFromHeaderText(scenarioSection.title),
          rawText: scenarioSection.content
        });
      }
    }
    
    return scenarios;
  }

}
