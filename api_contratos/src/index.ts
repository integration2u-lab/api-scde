import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import contractsRouter from './routes/contracts';

const app = express();

app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.use('/contracts', contractsRouter);

// Centralized error handling to avoid leaking stack traces in responses.
app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error', error);
  res.status(500).json({ error: 'Internal server error.' });
});

const port = Number(process.env.PORT ?? 3000);

const server = app.listen(port, () => {
  console.log(`API listening on port ${port}`);
});

const gracefulShutdown = (signal: NodeJS.Signals) => {
  console.log(`Received ${signal}. Closing server.`);
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

export default app;
