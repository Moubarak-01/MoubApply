import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import hpp from 'hpp';
import mongoSanitize from 'mongo-sanitize';
import { Express, Request, Response, NextFunction } from 'express';

/**
 * Configure Global Security Middleware
 */
export const configureSecurity = (app: Express) => {
    // 1. Helmet - Secure HTTP Headers
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                // Allow frontend to iframe the backend (for PDF viewer)
                "frame-ancestors": ["'self'", "http://localhost:5173"],
            }
        },
        // Allow cross-origin resource loading (for PDFs/Images)
        crossOriginResourcePolicy: { policy: "cross-origin" },
        // Disable X-Frame-Options because we use CSP frame-ancestors
        xFrameOptions: false,
    }));

    // 2. Data Sanitization against NoSQL Query Injection
    app.use((req: Request, res: Response, next: NextFunction) => {
        if (req.body) req.body = mongoSanitize(req.body);
        if (req.params) req.params = mongoSanitize(req.params);
        if (req.query) {
            const sanitizedQuery = mongoSanitize(req.query);
            // req.query is a getter in some contexts, so allow specific assignment or ignore
            try {
                req.query = sanitizedQuery as any;
            } catch (e) {
                // If assignment fails, try mutating keys
                for (const key in req.query) {
                    delete req.query[key];
                }
                Object.assign(req.query, sanitizedQuery);
            }
        }
        next();
    });

    // 3. Prevent HTTP Parameter Pollution
    app.use(hpp());

    // 4. Global Rate Limiting
    const globalLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 300, // Limit each IP to 300 requests per windowMs
        message: 'Too many requests from this IP, please try again after 15 minutes',
        standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
        legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    });
    app.use('/api', globalLimiter);
};

/**
 * Strict Rate Limiter for Auth Routes (Login/Signup)
 */
export const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // Limit each IP to 10 login attempts per hour
    message: 'Too many login attempts, please try again after an hour',
    standardHeaders: true,
    legacyHeaders: false,
});
