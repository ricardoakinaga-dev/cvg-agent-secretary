import { z } from 'zod';

const requiredText = (maxLength: number) => z.string().trim().min(1).max(maxLength);
const optionalText = (maxLength: number) => requiredText(maxLength).optional();
const uuid = z.string().uuid();
const isoDateTime = z.string().datetime({ offset: true });

const searchKnowledgeSchema = z.object({
  query: requiredText(1000),
  category: z.enum(['faq', 'policy', 'procedure', 'service', 'orientation']).optional(),
  limit: z.number().int().min(1).max(5).optional(),
}).strict();

const checkAvailableSlotsSchema = z.object({
  serviceId: uuid.optional(),
  from: isoDateTime,
  to: isoDateTime,
  limit: z.number().int().min(1).max(5).optional(),
}).strict().refine(
  ({ from, to }) => new Date(to).getTime() > new Date(from).getTime(),
  { message: 'to must be later than from' }
);

const reserveSlotSchema = z.object({
  slotId: uuid,
  confirmed: z.literal(true),
  serviceId: uuid.optional(),
  petId: uuid.optional(),
  tutorName: optionalText(200),
  petName: optionalText(200),
  reason: optionalText(1000),
  holdMinutes: z.number().int().min(1).max(60).optional(),
}).strict();

const confirmedMutation = {
  appointmentId: uuid,
  confirmed: z.literal(true),
};

const confirmAppointmentSchema = z.object(confirmedMutation).strict();

const cancelAppointmentSchema = z.object({
  ...confirmedMutation,
  reason: optionalText(1000),
}).strict();

const rescheduleAppointmentSchema = z.object({
  ...confirmedMutation,
  slotId: uuid,
  reason: optionalText(1000),
}).strict();

const createHandoffSchema = z.object({
  triggerType: requiredText(50),
  triggerReason: requiredText(1000),
  summary: optionalText(4000),
  pendingQuestions: z.array(requiredText(500)).max(20).optional(),
  whatWasAnswered: optionalText(4000),
  whatIsMissing: optionalText(4000),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
}).strict();

const notifySectorSchema = z.object({
  sector: z.enum(['recepcao', 'clinico', 'gerencia', 'financeiro']),
  message: requiredText(2000),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  confirmed: z.literal(true),
}).strict();

export const agentToolInputSchemas = {
  search_knowledge: searchKnowledgeSchema,
  check_available_slots: checkAvailableSlotsSchema,
  reserve_slot: reserveSlotSchema,
  confirm_appointment: confirmAppointmentSchema,
  cancel_appointment: cancelAppointmentSchema,
  reschedule_appointment: rescheduleAppointmentSchema,
  create_handoff: createHandoffSchema,
  notify_sector: notifySectorSchema,
};

export type AgentToolInputSchemas = typeof agentToolInputSchemas;
