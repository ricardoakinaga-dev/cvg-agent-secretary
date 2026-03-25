// Memory Tools Tests - Phase 2
// These tests verify the memory functionality without requiring a real database

import { VALID_SPECIES as PET_SPECIES } from '../../src/modules/pets/types';
import { VALID_CATEGORIES, VALID_SOURCES, CONFIDENCE_THRESHOLDS } from '../../src/modules/memory/types';
import { mapRowToMemory } from '../../src/modules/memory/types';
import { mapRowToContact } from '../../src/modules/contacts/types';
import { mapRowToPet } from '../../src/modules/pets/types';
import { mapRowToSummary } from '../../src/modules/summaries/types';

describe('Memory Types', () => {
  describe('Confidence Thresholds', () => {
    it('should have valid confidence thresholds', () => {
      expect(CONFIDENCE_THRESHOLDS.AUTO_SAVE).toBe(0.9);
      expect(CONFIDENCE_THRESHOLDS.IMPLICIT_CONFIRM).toBe(0.7);
      expect(CONFIDENCE_THRESHOLDS.EXPLICIT_CONFIRM).toBe(0.7);
    });

    it('should correctly identify auto-save threshold', () => {
      expect(CONFIDENCE_THRESHOLDS.AUTO_SAVE).toBeGreaterThanOrEqual(0.9);
    });
  });

  describe('Valid Categories', () => {
    it('should have all required categories', () => {
      expect(VALID_CATEGORIES).toContain('contact_info');
      expect(VALID_CATEGORIES).toContain('pet_info');
      expect(VALID_CATEGORIES).toContain('preference');
      expect(VALID_CATEGORIES).toContain('history');
      expect(VALID_CATEGORIES).toContain('need');
    });
  });

  describe('Valid Sources', () => {
    it('should have all required sources', () => {
      expect(VALID_SOURCES).toContain('extraction');
      expect(VALID_SOURCES).toContain('user_confirmed');
      expect(VALID_SOURCES).toContain('system');
      expect(VALID_SOURCES).toContain('update');
    });
  });

  describe('mapRowToMemory', () => {
    it('should correctly map a database row to Memory object', () => {
      const row = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        contact_id: '123e4567-e89b-12d3-a456-426614174001',
        pet_id: '123e4567-e89b-12d3-a456-426614174002',
        conversation_id: '123e4567-e89b-12d3-a456-426614174003',
        category: 'pet_info',
        key: 'pet_nome',
        value: { name: 'Buddy' },
        confidence: 0.95,
        source: 'extraction',
        is_active: true,
        last_confirmed_at: new Date('2024-01-15'),
        created_at: new Date('2024-01-15'),
        updated_at: new Date('2024-01-15'),
      };

      const memory = mapRowToMemory(row as any);

      expect(memory.id).toBe(row.id);
      expect(memory.contactId).toBe(row.contact_id);
      expect(memory.petId).toBe(row.pet_id);
      expect(memory.category).toBe('pet_info');
      expect(memory.key).toBe('pet_nome');
      expect(memory.value).toEqual({ name: 'Buddy' });
      expect(memory.confidence).toBe(0.95);
      expect(memory.source).toBe('extraction');
      expect(memory.isActive).toBe(true);
    });
  });
});

describe('Contact Types', () => {
  describe('mapRowToContact', () => {
    it('should correctly map a database row to Contact object', () => {
      const row = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        chatwoot_id: 12345,
        name: 'Maria Santos',
        email: 'maria@example.com',
        phone: '11999999999',
        whatsapp: null,
        address: null,
        city: 'São Paulo',
        state: 'SP',
        postal_code: '01234-567',
        cpf: null,
        preferred_channel: 'chatwoot',
        notes: null,
        created_at: new Date('2024-01-15'),
        updated_at: new Date('2024-01-15'),
        deleted_at: null,
      };

      const contact = mapRowToContact(row as any);

      expect(contact.id).toBe(row.id);
      expect(contact.chatwootId).toBe(12345);
      expect(contact.name).toBe('Maria Santos');
      expect(contact.email).toBe('maria@example.com');
      expect(contact.phone).toBe('11999999999');
      expect(contact.city).toBe('São Paulo');
      expect(contact.state).toBe('SP');
    });
  });
});

describe('Pet Types', () => {
  describe('VALID_SPECIES', () => {
    it('should have all required species', () => {
      expect(PET_SPECIES).toContain('cachorro');
      expect(PET_SPECIES).toContain('gato');
      expect(PET_SPECIES).toContain('pássaro');
      expect(PET_SPECIES).toContain('roedor');
      expect(PET_SPECIES).toContain('outro');
    });
  });

  describe('mapRowToPet', () => {
    it('should correctly map a database row to Pet object', () => {
      const row = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        chatwoot_id: null,
        contact_id: '123e4567-e89b-12d3-a456-426614174001',
        name: 'Buddy',
        species: 'cachorro',
        breed: 'Golden Retriever',
        birth_date: new Date('2019-05-10'),
        age_years: 5,
        age_months: 0,
        gender: 'macho',
        weight: 30.5,
        color: 'dourado',
        microchip: null,
        vaccination_status: 'em dia',
        medical_conditions: null,
        behavior_notes: null,
        photo_url: null,
        is_active: true,
        created_at: new Date('2024-01-15'),
        updated_at: new Date('2024-01-15'),
        deleted_at: null,
      };

      const pet = mapRowToPet(row as any);

      expect(pet.id).toBe(row.id);
      expect(pet.name).toBe('Buddy');
      expect(pet.species).toBe('cachorro');
      expect(pet.breed).toBe('Golden Retriever');
      expect(pet.ageYears).toBe(5);
      expect(pet.gender).toBe('macho');
      expect(pet.weight).toBe(30.5);
      expect(pet.isActive).toBe(true);
    });
  });
});

describe('Summary Types', () => {
  describe('mapRowToSummary', () => {
    it('should correctly map a database row to Summary object', () => {
      const row = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        conversation_id: '123e4567-e89b-12d3-a456-426614174001',
        summary_text: 'Cliente solicitou agendamento para banho',
        key_points: ['Pet: Buddy', 'Serviço: banho'],
        extracted_facts: [{ pet_nome: 'Buddy', servico: 'banho' }],
        intent: 'agendamento',
        sentiment: 'positive',
        needs_handoff: false,
        handoff_reason: null,
        generated_by: 'openai',
        model_version: 'gpt-4',
        created_at: new Date('2024-01-15'),
      };

      const summary = mapRowToSummary(row as any);

      expect(summary.id).toBe(row.id);
      expect(summary.conversationId).toBe(row.conversation_id);
      expect(summary.summaryText).toBe('Cliente solicitou agendamento para banho');
      expect(summary.keyPoints).toEqual(['Pet: Buddy', 'Serviço: banho']);
      expect(summary.intent).toBe('agendamento');
      expect(summary.sentiment).toBe('positive');
      expect(summary.needsHandoff).toBe(false);
      expect(summary.generatedBy).toBe('openai');
    });
  });
});