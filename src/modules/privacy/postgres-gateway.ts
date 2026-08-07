import { getClient } from '../../shared/db';
import { PostgresPrivacyGateway, PrivacyQueryClient } from './adapters';

interface ReleasablePrivacyQueryClient extends PrivacyQueryClient {
  release(): void;
}

type ConnectPrivacyClient = () => Promise<ReleasablePrivacyQueryClient>;

const defaultConnect: ConnectPrivacyClient = async () => getClient();

export function createPostgresPrivacyGateway(
  connect: ConnectPrivacyClient = defaultConnect
): PostgresPrivacyGateway {
  return {
    async withClient<T>(work: (client: PrivacyQueryClient) => Promise<T>): Promise<T> {
      const client = await connect();
      try {
        return await work(client);
      } finally {
        client.release();
      }
    },

    async withTransaction<T>(work: (client: PrivacyQueryClient) => Promise<T>): Promise<T> {
      const client = await connect();
      try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Preserve the original failure; the connection is discarded/released below.
        }
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
