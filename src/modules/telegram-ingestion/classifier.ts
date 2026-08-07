// Telegram Content Classifier
// Phase 5: Classifies incoming content for routing

import {
  TelegramContentType,
  ClassificationResult,
  ValidationResult,
  ContentDestination,
  TargetTable,
  CONTENT_LIMITS,
} from './types';

/**
 * Classification patterns for content types
 * Based on spec 07_TELEGRAM_INGESTION.md
 */
const CLASSIFICATION_PATTERNS: Record<TelegramContentType, {
  patterns: RegExp[];
  keywords: string[];
  confidence: number;
}> = {
  faq: {
    patterns: [
      /^[Pp]:\s*.+/m,           // P: or p: prefix
      /^[Pp]ergunta:\s*.+/m,    // Pergunta:
      /^[Qq]ual (é|são)/i,       // Qual é/Quais são
      /^[Qq]uando/i,             // Quando
      /^[Oo]nd[é]\s/i,          // Onde
      /^[Cc]omo\s/i,            // Como
      /^[Pp]or que/i,           // Por que
      /^[Ee]xiste/m,            // Existe
    ],
    keywords: ['faq', 'pergunta', 'resposta', 'duvida', 'dúvida'],
    confidence: 0.9,
  },
  policy: {
    patterns: [
      /pol[ií]tica[:\s]/i,
      /policy[:\s]/i,
      /regra[:\s]/i,
      /norma[:\s]/i,
      /procedimento oficial/i,
    ],
    keywords: ['política', 'policy', 'regra', 'norma', 'regulamento'],
    confidence: 0.85,
  },
  procedure: {
    patterns: [
      /^passo\s*\d+/im,
      /^etapa\s*\d+/im,
      /^procedimento[:\s]/i,
      /^instrução[:\s]/i,
      /^orientação[:\s]/i,
      /^\d+\.\s+/m,
    ],
    keywords: ['passo', 'etapa', 'procedimento', 'instrução', 'orientação', 'como fazer'],
    confidence: 0.8,
  },
  rule: {
    patterns: [
      /^regra[:\s]/im,
      /^rule[:\s]/im,
      /^[Rr]egra\s+de/i,
      /deve\s+ser/i,
      /não\s+pode/i,
      /proibido/i,
      /obrigatório/i,
    ],
    keywords: ['regra', 'rule', 'obrigatório', 'proibido', 'deve', 'não pode'],
    confidence: 0.85,
  },
  command: {
    patterns: [
      /^\/[a-zA-Z]+/,           // Starts with /
      /^!comando/i,
      /^!cmd/i,
    ],
    keywords: [],
    confidence: 1.0,
  },
  feedback: {
    patterns: [
      /^feedback[:\s]/i,
      /^sugestão[:\s]/i,
      /^opinião[:\s]/i,
      /^reclamação[:\s]/i,
      /^elogio[:\s]/i,
    ],
    keywords: ['feedback', 'sugestão', 'opinião', 'reclamação', 'elogio'],
    confidence: 0.8,
  },
  schedule: {
    patterns: [
      /horário[s]?[:\s]/i,
      /funcionamento[:\s]/i,
      /aberto[:\s]/i,
      /fechado[:\s]/i,
      /\d{1,2}h\s*(?:às?|ate|as|-)\s*\d{1,2}h/i,
      /(?:segunda|terça|quarta|quinta|sexta|sábado|domingo)/i,
    ],
    keywords: ['horário', 'funcionamento', 'aberto', 'fechado', 'manhã', 'tarde', 'noite'],
    confidence: 0.85,
  },
  price: {
    patterns: [
      /preço[:\s]/i,
      /valor[:\s]/i,
      /custo[:\s]/i,
      /tarifa[:\s]/i,
      /R\$\s*\d+/,
      /\$\d+/,
    ],
    keywords: ['preço', 'valor', 'custo', 'tarifa', 'pagamento', 'parcelamento'],
    confidence: 0.9,
  },
  instruction: {
    patterns: [
      /^instrução[:\s]/i,
      /^memo[:\s]/i,
      /^aviso[:\s]/i,
      /^comunicado[:\s]/i,
    ],
    keywords: ['instrução', 'memo', 'aviso', 'comunicado', 'interno'],
    confidence: 0.75,
  },
};

/**
 * Routing rules based on content type
 * Based on spec 05_RAG_KNOWLEDGE_SYSTEM.md
 */
const ROUTING_RULES: Record<TelegramContentType, {
  destination: ContentDestination;
  targetTable: TargetTable;
  requiresApproval: boolean;
  autoPublish: boolean;
}> = {
  faq: {
    destination: 'rag',
    targetTable: 'knowledge_documents',
    requiresApproval: true,
    autoPublish: false,
  },
  policy: {
    destination: 'both',
    targetTable: 'knowledge_documents',
    requiresApproval: true,
    autoPublish: false,
  },
  procedure: {
    destination: 'rag',
    targetTable: 'knowledge_documents',
    requiresApproval: true,
    autoPublish: false,
  },
  rule: {
    destination: 'postgres',
    targetTable: 'operational_rules',
    requiresApproval: true,
    autoPublish: false,
  },
  command: {
    destination: 'rejected',
    targetTable: 'knowledge_documents',
    requiresApproval: false,
    autoPublish: false,
  },
  feedback: {
    destination: 'postgres',
    targetTable: 'operational_rules',
    requiresApproval: false,
    autoPublish: false,
  },
  schedule: {
    destination: 'postgres',
    targetTable: 'operational_rules',
    requiresApproval: true,
    autoPublish: false,
  },
  price: {
    destination: 'postgres',
    targetTable: 'prices',
    requiresApproval: true,
    autoPublish: false,
  },
  instruction: {
    destination: 'rag',
    targetTable: 'knowledge_documents',
    requiresApproval: true,
    autoPublish: false,
  },
};

/**
 * Content Classifier Service
 * Classifies incoming Telegram content and determines routing
 */
class ClassifierService {
  /**
   * Classify content type based on patterns and keywords
   */
  classify(content: string, title?: string): ClassificationResult {
    const combinedText = title ? `${title}\n${content}` : content;
    let bestMatch: TelegramContentType = 'instruction'; // Default
    let highestScore = 0;
    const detectedTags: string[] = [];

    // Check for commands first (highest priority)
    if (this.isCommand(combinedText)) {
      return {
        type: 'command',
        confidence: 1.0,
        title: this.extractTitle(content, title),
        tags: ['comando'],
      };
    }

    // Explicit Q&A syntax is authoritative. The answer may contain hours or
    // prices, but that must not re-route an FAQ into a structured schedule or
    // price record.
    if (/^(?:P:|Pergunta:)\s*.+/im.test(combinedText)) {
      return {
        type: 'faq',
        confidence: 0.95,
        title: this.extractTitle(content, title),
        tags: ['faq', ...this.extractDomainTags(combinedText)],
        extractedData: this.extractStructuredData('faq', content),
      };
    }

    // Score each content type
    for (const [contentType, config] of Object.entries(CLASSIFICATION_PATTERNS)) {
      const type = contentType as TelegramContentType;
      let score = 0;

      // Check patterns
      for (const pattern of config.patterns) {
        if (pattern.test(combinedText)) {
          score += config.confidence;
          detectedTags.push(type);
        }
      }

      // Check keywords
      for (const keyword of config.keywords) {
        if (combinedText.toLowerCase().includes(keyword)) {
          score += 0.2;
          if (!detectedTags.includes(keyword)) {
            detectedTags.push(keyword);
          }
        }
      }

      if (score > highestScore) {
        highestScore = score;
        bestMatch = type;
      }
    }

    // Normalize confidence
    const confidence = Math.min(highestScore, 1.0);

    return {
      type: bestMatch,
      confidence,
      title: this.extractTitle(content, title),
      tags: [...new Set([...detectedTags, ...this.extractDomainTags(combinedText)])],
      extractedData: this.extractStructuredData(bestMatch, content),
    };
  }

  /**
   * Check if content is a command
   */
  private isCommand(content: string): boolean {
    return /^\/[a-zA-Z]+/.test(content.trim());
  }

  private extractDomainTags(content: string): string[] {
    const tags: string[] = [];
    if (/\bemerg[eê]ncia\b/i.test(content)) {
      tags.push('emergência');
    }
    return tags;
  }

  /**
   * Extract title from content
   */
  private extractTitle(content: string, providedTitle?: string): string {
    if (providedTitle) {
      return providedTitle;
    }

    // Try to extract from first line
    const firstLine = content.split('\n')[0].trim();
    
    // If it's a header-like line, use it
    if (firstLine.length > 0 && firstLine.length < 200) {
      // Remove common prefixes
      return firstLine
        .replace(/^[Pp]:\s*/, '')
        .replace(/^[Pp]ergunta:\s*/, '')
        .replace(/^[Pp]ol[ií]tica:\s*/i, '')
        .replace(/^[Rr]egra:\s*/i, '')
        .replace(/^[Ii]nstrução:\s*/i, '');
    }

    // Generate a title from first N characters
    const preview = content.substring(0, 100).replace(/\n/g, ' ');
    return `${preview}...`;
  }

  /**
   * Extract structured data from content based on type
   */
  private extractStructuredData(
    type: TelegramContentType,
    content: string
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {};

    switch (type) {
      case 'schedule':
        data.schedule = this.extractScheduleData(content);
        break;
      case 'price':
        data.price = this.extractPriceData(content);
        break;
      case 'rule':
        data.rules = this.extractRules(content);
        break;
      case 'faq': {
        const faq = this.extractFaq(content);
        if (faq) {
          data.question = faq.question;
          data.answer = faq.answer;
        }
        break;
      }
    }

    return data;
  }

  /**
   * Extract schedule data from content
   */
  private extractScheduleData(content: string): Record<string, unknown> {
    const schedule: Record<string, unknown> = {};
    const dayPattern = /(?:segunda|terça|quarta|quinta|sexta|s[aá]bado|domingo)[a-z]*/gi;
    const timePattern = /(\d{1,2})h\s*(?:às?|ate|as|-)?\s*(\d{1,2})h?/gi;

    // Extract day mentions
    const days = content.match(dayPattern);
    if (days) {
      schedule.days = days.map(d => d.toLowerCase());
    }

    // Extract time ranges
    const timeMatch = content.match(timePattern);
    if (timeMatch) {
      schedule.times = timeMatch;
    }

    // Check for 24h emergency
    if (/24\s*h/i.test(content) || /emergência/i.test(content)) {
      schedule.emergency = true;
    }

    return schedule;
  }

  /**
   * Extract price data from content
   */
  private extractPriceData(content: string): Record<string, unknown> {
    const prices: Array<{ item: string; value: string }> = [];
    
    // Extract price patterns like "Serviço: R$ 100"
    const pricePattern = /([A-Za-zÀ-ÖØ-öø-ÿ\s]+):\s*R?\$?\s*(\d+(?:[.,]\d{2})?)/gi;
    let match;
    
    while ((match = pricePattern.exec(content)) !== null) {
      prices.push({
        item: match[1].trim(),
        value: match[2].replace(',', '.'),
      });
    }

    return { items: prices };
  }

  /**
   * Extract rules from content
   */
  private extractRules(content: string): string[] {
    const rules: string[] = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      // Numbered rules
      if (/^\d+[.)]/.test(trimmed)) {
        rules.push(trimmed);
      }
      // Bullet points
      else if (/^[-•*]\s+/.test(trimmed)) {
        rules.push(trimmed.replace(/^[-•*]\s+/, ''));
      }
    }

    return rules;
  }

  /**
   * Extract FAQ Q&A from content
   */
  private extractFaq(content: string): { question: string; answer: string } | null {
    const qaPattern = /[Pp]:\s*([^\n]+)\n[Rr]:\s*([^\n]+)/;
    const match = content.match(qaPattern);
    
    if (match) {
      return {
        question: match[1].trim(),
        answer: match[2].trim(),
      };
    }

    return null;
  }

  /**
   * Validate content
   */
  validate(content: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check minimum length
    if (content.length < CONTENT_LIMITS.minLength) {
      errors.push(
        `Content too short: minimum ${CONTENT_LIMITS.minLength} characters, got ${content.length}`
      );
    }

    // Check maximum length
    if (content.length > CONTENT_LIMITS.maxLength) {
      warnings.push(
        `Content too long: will be truncated to ${CONTENT_LIMITS.maxLength} characters`
      );
    }

    // Check for suspicious patterns
    if (/<script/i.test(content)) {
      errors.push('Content contains potential script injection');
    }

    // Check for URLs (warn only)
    if (/https?:\/\//i.test(content)) {
      warnings.push('Content contains URLs - ensure they are from trusted sources');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get routing decision based on content type
   */
  getRouting(type: TelegramContentType): {
    destination: ContentDestination;
    targetTable: TargetTable;
    requiresApproval: boolean;
    initialStatus: 'pending' | 'processed';
  } {
    const rule = ROUTING_RULES[type];
    
    return {
      destination: rule.destination,
      targetTable: rule.targetTable,
      requiresApproval: rule.requiresApproval,
      initialStatus: rule.autoPublish ? 'processed' : 'pending',
    };
  }
}

export const classifierService = new ClassifierService();
