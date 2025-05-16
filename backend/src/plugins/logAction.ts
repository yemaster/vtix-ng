import { FastifyInstance } from "fastify";
import { Log } from "../models";

import fp from 'fastify-plugin';

declare module 'fastify' {
    interface FastifyInstance {
        logAction: (username: string, detail: string, ip: string) => void;
    }
}

async function logPlugin(fastify: FastifyInstance) {
    fastify.decorate('logAction', async (username: string, detail: string, ip: string) => {
        const logRepository = fastify.dataSource.getRepository(Log);

        const newLog = logRepository.create({
            username,
            detail,
            ip,
            time: new Date()
        });

        await logRepository.save(newLog);
    });
}

export default fp(logPlugin);