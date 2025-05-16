import fp from 'fastify-plugin';
import { DataSource, DataSourceOptions } from 'typeorm';
import { FastifyInstance } from 'fastify';

async function typeormPlugin(app: FastifyInstance, opts: any) {
    const dataSource = new DataSource(opts);
    try {
        await dataSource.initialize();
        app.decorate('dataSource', dataSource);
        app.addHook('onClose', async () => {
            await dataSource.destroy();
        });
    }
    catch (error) {
        app.log.error("Error initializing typeorm:", error);
        throw error;
    }
}

export default fp(typeormPlugin);