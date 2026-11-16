import { startFakeServer } from './fake-server';

/** Starts the fake Worker on 127.0.0.1:8788 (flows 5–6) for the whole run. */
export default async function globalSetup() {
  const server = await startFakeServer();
  return async () => {
    await new Promise<void>((r) => server.close(() => r()));
  };
}
