const { z } = require('zod');
const { objectId } = require('../../middlewares/validate');

const cardParams = z.object({ boardId: objectId, cardId: objectId });

const createCardSchema = z.object({
  listId: objectId,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
});

const updateCardSchema = z
  .object({
    // Optimistic locking: the client sends the version it last saw.
    version: z.number().int().min(0),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5000).optional(),
    assignees: z.array(objectId).max(20).optional(),
    labels: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
    dueDate: z.coerce.date().nullable().optional(),
    completed: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 1, 'Nothing to update');

const moveCardSchema = z.object({
  toListId: objectId,
  index: z.number().int().min(0),
});

const searchQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  assignee: objectId.optional(),
  label: z.string().trim().max(30).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

module.exports = {
  cardParams,
  createCardSchema,
  updateCardSchema,
  moveCardSchema,
  searchQuerySchema,
};
