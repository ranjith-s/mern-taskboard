const { z } = require('zod');
const { objectId } = require('../../middlewares/validate');

const createBoardSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
});

const updateBoardSchema = createBoardSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Nothing to update');

// 'owner' is deliberately not assignable through the API.
const assignableRole = z.enum(['admin', 'member', 'viewer']);

const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  role: assignableRole.default('member'),
});

const updateMemberSchema = z.object({ role: assignableRole });

const memberParams = z.object({ boardId: objectId, userId: objectId });

module.exports = {
  createBoardSchema,
  updateBoardSchema,
  addMemberSchema,
  updateMemberSchema,
  memberParams,
};
