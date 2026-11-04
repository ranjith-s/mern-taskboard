const { z } = require('zod');

const email = z.string().trim().toLowerCase().pipe(z.email('Invalid email'));

const registerSchema = z.object({
  name: z.string().trim().min(2).max(60),
  email,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72) // bcrypt only uses the first 72 bytes
    .regex(/[A-Za-z]/, 'Password must contain a letter')
    .regex(/[0-9]/, 'Password must contain a number'),
});

const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
});

module.exports = { registerSchema, loginSchema };
