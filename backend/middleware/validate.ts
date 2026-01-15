import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

// Generic validation middleware
export const validate = (schema: z.ZodObject<any, any>) => {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            schema.parse(req.body);
            next();
        } catch (error) {
            // Check if it's a ZodError (using 'any' cast to avoid TS strictness issues)
            if (error instanceof z.ZodError || (error as any).errors) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Invalid input data',
                    errors: (error as any).errors.map((e: any) => ({
                        field: e.path.join('.'),
                        message: e.message
                    }))
                });
            }
            // Pass other errors to global error handler
            next(error);
        }
    };
};

// Auth Schemas
export const signupSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters')
});

export const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required')
});

// Job Ingestion Schema
export const ingestSchema = z.object({
    query: z.string().min(1, 'Search query is required'),
    range: z.string().optional()
});
